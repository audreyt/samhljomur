// samhljomur pipeline CLI.
//   bun run src/cli.ts judge    stages 1-3 (live models, cache-resumable)
//   bun run src/cli.ts arrange  stage 4 (needs judgments+glosses; cache/live)
//   bun run src/cli.ts build    stages 1-4 replay from cache, no network
//   bun run src/cli.ts rerun --model <clef|granite>
//   bun run src/cli.ts smoke    tiny live check (2 isl, 2 places, 2 topics, 3 glosses)

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { RunCtx, call, CacheMiss, ModelKind } from "./model";
import { loadSnapshot } from "./data";
import { stage1, writeJudgments, Judgments } from "./stage1";
import { stage2, writeGlosses, Glosses, writeBakeoff } from "./stage2";
import { stage3, writeCalibration } from "./stage3";
import { stage4, writeLyrics, Stage4Out } from "./stage4";
import { stage5, makeTake, MusicResult } from "./stage5";
import {
  stage6,
  alignTake,
  scribe,
  placeholderTimeline,
  writeTimeline,
  Timeline,
} from "./stage6";
import { BASE_URL, EXTRA_SEEDS, TAKE_SCORE_MIN, TRANSLATORS } from "./spec";

const cmd = process.argv[2];
const args = process.argv.slice(3);

function argVal(name: string): string | undefined {
  const i = args.indexOf(name);
  if (i !== -1) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq?.split("=").slice(1).join("=");
}

function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}

async function runJudges(ctx: RunCtx, limit = 0): Promise<Judgments> {
  const j = await stage1(ctx, undefined, limit);
  writeJudgments(j);
  return j;
}

async function runGlosses(ctx: RunCtx, j: Judgments, limit = 0): Promise<Glosses> {
  const g = await stage2(ctx, j, limit);
  writeGlosses(g);
  writeBakeoff(g);
  return g;
}

async function runArrange(ctx: RunCtx, j: Judgments, g: Glosses): Promise<Stage4Out> {
  const out = stage4(j, g);
  writeLyrics(out);
  console.log(
    `[stage4] ${out.movements.length} movements, ` +
      `${out.movements.reduce((s, m) => s + m.lines.length, 0)} sung lines, ` +
      `${out.total_duration_ms} ms total, ${out.exclusions.length} exclusions, ` +
      `${out.overrides.length} overrides`,
  );
  return out;
}

function loadLyrics(): Stage4Out {
  const d = JSON.parse(readFileSync("out/lyrics.json", "utf8"));
  return d as unknown as Stage4Out; // movements/chunks shape is identical
}

// Stage 6 + extra-seed rule: score all takes; while best < 0.45 make up to
// two more seeds (4, 5).
async function alignWithRetries(ctx: RunCtx, lyrics: Stage4Out, takes: import("./stage5").Take[]): Promise<Timeline> {
  let tl = await stage6(ctx, lyrics, takes);
  let best = Math.max(...tl.takes.map((t) => t.score), 0);
  for (const seed of EXTRA_SEEDS) {
    if (best >= TAKE_SCORE_MIN) break;
    try {
      const t = await makeTake(ctx, lyrics, seed);
      takes.push(t);
      tl = await stage6(ctx, lyrics, takes);
      best = Math.max(...tl.takes.map((x) => x.score));
    } catch (e) {
      console.error(`[stage5] extra seed ${seed} failed: ${e}`);
      break;
    }
  }
  writeTimeline(tl);
  return tl;
}

// Stage 5 + 6 combined (used by `music` and `build`).
async function musicAndAlign(ctx: RunCtx): Promise<Timeline> {
  const lyrics = loadLyrics();
  const res = await stage5(ctx, lyrics);
  if (res.error || !res.takes.length) {
    console.error("[stage5] no takes — writing placeholder timeline");
    const tl = placeholderTimeline(lyrics);
    writeTimeline(tl);
    return tl;
  }
  return alignWithRetries(ctx, lyrics, res.takes);
}

async function main() {
  mkdirSync("out", { recursive: true });

  if (cmd === "judge" || cmd === "arrange" || cmd === "build") {
    const ctx = new RunCtx(cmd === "build" ? "replay" : "live");
    const t0 = Date.now();
    try {
      const j = await runJudges(ctx);
      console.log(
        `[stage1] ${j.isl.length} isl, ${j.places.length} places, ${j.topics.length} topics judged`,
      );
      const g = await runGlosses(ctx, j);
      const low = g.entries.filter((e) => e.faithful < 0.6).length;
      console.log(
        `[stage2] ${g.entries.length} glosses (${low} with Clef faithful <0.60 — informational only; selection is by C2)`,
      );
      writeCalibration(stage3(j));
      console.log(`[stage3] calibration written`);
      if (cmd !== "judge") {
        await runArrange(ctx, j, g);
        if (cmd === "build") {
          // stages 5-6 replay from cache (elevenlabs bodies under media/takes/)
          await musicAndAlign(ctx);
          const { stage7 } = await import("./stage7");
          await stage7(ctx);
        }
      }
      ctx.finishManifest(cmd);
    } catch (e) {
      ctx.finishManifest(`${cmd} (failed)`);
      if (e instanceof CacheMiss) {
        console.error(`REPLAY MISS: ${e.message}`);
        console.error(
          "Run `vp run judge` first to populate the cache, or check for spec/text drift.",
        );
        process.exit(2);
      }
      throw e;
    }
    console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s — runs/${ctx.runId}`);
    return;
  }

  if (cmd === "rerun") {
    const model = (argVal("--model") ?? argVal("model") ?? "") as ModelKind;
    if (!["clef", ...TRANSLATORS.map((t) => t.id)].includes(model)) {
      console.error(`usage: vp run rerun -- --model <clef|${TRANSLATORS.map((t) => t.id).join("|")}>`);
      process.exit(1);
    }
    const ctx = new RunCtx("recall");
    const dir = `cache/${model}`;
    let files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    const lim = parseInt(argVal("--limit") ?? "0", 10);
    if (lim > 0) files = files.slice(0, lim);
    const diffs: { sha: string; label: string; changed: string[] }[] = [];
    let same = 0;
    for (const [i, f] of files.entries()) {
      const entry = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
      const cfg = TRANSLATORS.find((t) => t.id === model);
      const url =
        model === "clef" ? `${BASE_URL}/v1/systemone` : cfg!.url;
      const fresh = await call(ctx, model!, url, entry.request, `rerun:${f}`);
      // compare the semantic payload only; timing fields always differ
      const payload = (r: unknown) =>
        model === "clef"
          ? (r as Record<string, unknown>).answers
          : cfg!.api === "openai-chat"
            ? (r as { choices?: { message?: { content?: string } }[] })
                ?.choices?.[0]?.message?.content
            : (r as { message?: { content?: string } }).message?.content;
      const changed: string[] =
        canonical(payload(entry.response)) ===
        canonical(payload(fresh.response))
          ? []
          : [model === "clef" ? "answers" : "message.content"];
      if (changed.length) diffs.push({ sha: f.slice(0, -5), label: f, changed });
      else same++;
      if ((i + 1) % 25 === 0) console.log(`[rerun] ${i + 1}/${files.length}`);
    }
    const report = {
      model,
      run_id: ctx.runId,
      requests_recalled: files.length,
      identical: same,
      changed: diffs.length,
      diffs,
      note: "fresh responses stored under this run dir as recall-<model>-<sha>.json; cache is NOT modified",
    };
    writeFileSync(
      `${ctx.runDir}/rerun-${model}-diff.json`,
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(
      `[rerun] ${model}: ${files.length} requests re-called, ${same} identical, ${diffs.length} changed -> ${ctx.runDir}/rerun-${model}-diff.json`,
    );
    ctx.finishManifest(`rerun ${model}`);
    return;
  }

  if (cmd === "smoke") {
    const ctx = new RunCtx("live");
    const snap = loadSnapshot();
    const j = await stage1(ctx, snap, 2);
    console.log("isl[0] clef keys:", Object.keys(j.isl[0].clef));
    console.log("place[0] excerpt?", !!j.places[0].excerpt, j.places[0].needsExcerpt);
    const g = await stage2(ctx, j, 3);
    for (const e of g.entries)
      console.log(`gloss ${e.kind}: "${e.is.slice(0, 40)}" -> "${e.en.slice(0, 60)}" f=${e.faithful.toFixed(2)}`);
    ctx.finishManifest("smoke");
    return;
  }

  if (cmd === "music" || cmd === "align") {
    const ctx = new RunCtx("live");
    try {
      await musicAndAlign(ctx);
      ctx.finishManifest(cmd);
    } catch (e) {
      ctx.finishManifest(`${cmd} (failed)`);
      throw e;
    }
    return;
  }

  if (cmd === "site") {
    const { stage7 } = await import("./stage7");
    const ctx = new RunCtx("live");
    await stage7(ctx);
    ctx.finishManifest("site");
    return;
  }

  if (cmd === "verify") {
    const { runGates } = await import("./gates");
    const ctx = new RunCtx("live");
    const ok = await runGates(ctx);
    ctx.finishManifest("verify");
    process.exit(ok ? 0 : 1);
  }

  console.error(`unknown command: ${cmd}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
