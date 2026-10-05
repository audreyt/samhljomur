// Stage 2: bilingual-machine glosses with Clef fidelity check -> out/glosses.json
// Amendment A6: Granite AND Gemma both translate every text under identical
// prompts/options/retry rules; Clef `faithful` scores every attempt; chosen =
// higher faithful (ties within 0.05 -> Gemma). A7: copy/gloss-edits.json
// (lead-authored) overrides the chosen gloss and is labelled ritstýrt/edited.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { chat, clef, RunCtx } from "./model";
import {
  faithfulQuestion,
  faithfulState,
  FAITHFUL_THRESHOLD,
  GLOSS_EDITS_PATH,
  GLOSS_SYSTEM,
  MAX_GLOSS_RETRIES,
  RETRY_PREFIX,
  TAGLINE,
  TIE_ORDER,
  TRANSLATORS,
  TranslatorCfg,
} from "./spec";
import { Judgments } from "./stage1";

export interface GlossAttempt {
  en: string;
  faithful: number;
  temperature: number;
  ms: number; // live latency (or the latency stored in the cache entry)
  model_sha: string;
  clef_sha: string;
}

export interface ModelGloss {
  en: string;
  faithful: number;
  attempts: GlossAttempt[];
}

export interface GlossEntry {
  kind: "answer" | "reason" | "excerpt" | "topic" | "tagline";
  is: string;
  en: string; // chosen (or editorial) gloss
  faithful: number; // Clef faithful of the chosen gloss
  model: string; // translator id, or "edited"
  edited?: boolean;
  cands: Record<string, ModelGloss>; // keyed by translator id
}

export interface Glosses {
  entries: GlossEntry[];
}

async function modelGloss(
  ctx: RunCtx,
  cfg: TranslatorCfg,
  kind: GlossEntry["kind"],
  is: string,
): Promise<ModelGloss> {
  const attempts: GlossAttempt[] = [];
  const tryGloss = async (
    user: string,
    options: Record<string, unknown>,
    temperature: number,
  ) => {
    const g = await chat(ctx, cfg, GLOSS_SYSTEM, user, options, `gloss:${kind}`);
    const f = await clef(
      ctx,
      faithfulState(is, g.text),
      { faithful: faithfulQuestion() },
      `faithful:${kind}`,
    );
    const noul = (f.answers.faithful as { noul?: number })?.noul ?? 0;
    attempts.push({
      en: g.text,
      faithful: noul,
      temperature,
      ms: g.ms,
      model_sha: g.sha,
      clef_sha: f.sha,
    });
    return noul;
  };

  let score = await tryGloss(is, cfg.options, 0.2);
  let retries = 0;
  while (score < FAITHFUL_THRESHOLD && retries < MAX_GLOSS_RETRIES) {
    retries++;
    score = await tryGloss(RETRY_PREFIX + is, cfg.retry_options, 0);
  }
  let best = attempts[0];
  for (const a of attempts) if (a.faithful > best.faithful) best = a;
  return { en: best.en, faithful: best.faithful, attempts };
}

function loadGlossEdits(): Record<string, string> {
  if (!existsSync(GLOSS_EDITS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(GLOSS_EDITS_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function glossOne(
  ctx: RunCtx,
  kind: GlossEntry["kind"],
  is: string,
  edits: Record<string, string>,
): Promise<GlossEntry> {
  const cands: Record<string, ModelGloss> = {};
  for (const t of TRANSLATORS) cands[t.id] = await modelGloss(ctx, t, kind, is);

  // C2: Clef faithful is not a usable judge; chosen = Gemma always,
  // edits override. Every candidate + Clef score is kept in cands.
  const chosen = cands["gemma"];
  const entry: GlossEntry = {
    kind,
    is,
    en: chosen.en,
    faithful: chosen.faithful,
    model: "gemma",
    cands,
  };
  if (is in edits) {
    entry.en = edits[is];
    entry.edited = true;
    entry.model = "edited";
  }
  return entry;
}

export async function stage2(
  ctx: RunCtx,
  judgments: Judgments,
  limit = 0,
): Promise<Glosses> {
  const edits = loadGlossEdits();
  const jobs: { kind: GlossEntry["kind"]; is: string }[] = [];
  const seenKey = new Set<string>();
  const add = (kind: GlossEntry["kind"], is: string) => {
    const k = `${kind} ${is}`;
    if (seenKey.has(k)) return;
    seenKey.add(k);
    jobs.push({ kind, is });
  };

  for (const it of judgments.isl) add("answer", it.answer);
  for (const p of judgments.places) {
    add("reason", p.reason);
    if (p.excerpt) add("excerpt", p.excerpt.sentence);
  }
  for (const t of judgments.topics) add("topic", t.word);
  add("tagline", TAGLINE); // movement-6 closing line needs an EN gloss too

  const todo = limit > 0 ? jobs.slice(0, limit) : jobs;
  const entries: GlossEntry[] = [];
  for (const [i, j] of todo.entries()) {
    entries.push(await glossOne(ctx, j.kind, j.is, edits));
    if ((i + 1) % 20 === 0)
      console.log(`[stage2] glosses ${i + 1}/${todo.length}`);
  }
  return { entries };
}

export function writeGlosses(g: Glosses, path = "out/glosses.json") {
  writeFileSync(path, JSON.stringify(g, null, 2) + "\n");
}

export function glossMap(g: Glosses): Map<string, GlossEntry> {
  const m = new Map<string, GlossEntry>();
  for (const e of g.entries) m.set(`${e.kind} ${e.is}`, e);
  return m;
}

// ---- A6 bake-off report ----

export function bakeoff(g: Glosses) {
  const items = g.entries.map((e) => ({
    kind: e.kind,
    is: e.is,
    cands: Object.fromEntries(
      Object.entries(e.cands).map(([id, c]) => [
        id,
        { en: c.en, faithful: c.faithful },
      ]),
    ),
    chosen: e.model,
    chosen_en: e.en,
    chosen_faithful: e.edited ? null : e.faithful,
    edited: !!e.edited,
  }));
  const median = (a: number[]) => {
    const s = a.slice().sort((x, y) => x - y);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };
  const stat = (key: string) => {
    const arr = g.entries.map((e) => e.cands[key].faithful);
    const lat = g.entries.flatMap((e) => e.cands[key].attempts.map((a) => a.ms));
    return {
      name: TRANSLATORS.find((t) => t.id === key)?.name ?? key,
      mean_faithful: arr.reduce((a, b) => a + b, 0) / arr.length,
      wins: g.entries.filter((e) => e.model === key).length,
      under_060: arr.filter((f) => f < FAITHFUL_THRESHOLD).length,
      median_latency_ms: median(lat),
    };
  };
  const out: Record<string, unknown> = {
    models: TRANSLATORS.map((t) => t.id),
    items,
    edited: items.filter((i) => i.edited).length,
    spot_check:
      "On 14 items where Granite's gloss was visibly wrong, Gemma's was right on 12 and Apertus 1.5 8B's on 8 (lead review).",
  };
  for (const t of TRANSLATORS) out[t.id] = stat(t.id);
  return out as any;
}

export function writeBakeoff(g: Glosses) {
  const b = bakeoff(g) as any;
  writeFileSync("out/gloss-bakeoff.json", JSON.stringify(b, null, 2) + "\n");
  const L: string[] = [];
  L.push(
    `# Gloss bake-off — ${TRANSLATORS.map((t) => t.name).join(" vs ")} (A6+B)`,
    "",
  );
  L.push("Gögn: Samtal, félag til almannaheilla (talasaman.is), CC BY 4.0", "");
  L.push(b.spot_check, "");
  L.push("| model | mean faithful | chosen (wins) | best < 0.60 | median latency |");
  L.push("|---|---:|---:|---:|---:|");
  for (const t of TRANSLATORS) {
    const s = b[t.id];
    L.push(
      `| ${t.name} | ${s.mean_faithful.toFixed(3)} | ${s.wins} | ${s.under_060} | ${(s.median_latency_ms / 1000).toFixed(2)} s |`,
    );
  }
  L.push("", `Editorial overrides applied: ${b.edited}`, "");
  L.push("## Side by side", "");
  L.push(
    "| IS | " + TRANSLATORS.map((t) => `${t.name} (f)`).join(" | ") + " | chosen |",
  );
  L.push("|" + "---|".repeat(TRANSLATORS.length + 2));
  for (const i of b.items) {
    const is = i.is.replace(/\|/g, "\\|").replace(/\n/g, " ");
    const cols = TRANSLATORS.map(
      (t) =>
        `${i.cands[t.id].en.replace(/\|/g, "\\|").replace(/\n/g, " ")} (${i.cands[t.id].faithful.toFixed(2)})`,
    ).join(" | ");
    L.push(`| ${is} | ${cols} | ${i.chosen} |`);
  }
  writeFileSync("out/gloss-bakeoff.md", L.join("\n") + "\n");
}
