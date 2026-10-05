// Stage 5: ElevenLabs Music v2.5 -> media/takes/take-seed-<seed>.mp3
// Per SPEC: composition_plan with per-chunk text/duration_ms/styles; seeds
// 1010, 463, 2026 (three takes); extra seeds 4,5 only when stage 6 demands.
// Every call goes through elCall -> cache + media/takes + runs/<id> log.

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { elCall, RunCtx, sha256hex } from "./model";
import { EL_MUSIC_MODEL, EL_MUSIC_URL, SEEDS, EXTRA_SEEDS } from "./spec";
import { Stage4Out } from "./stage4";

export interface Take {
  seed: number;
  file: string; // media/takes/take-seed-<seed>.mp3
  request_sha: string;
  status: number;
  headers: Record<string, string>;
  bytes: number;
}

const KEY = () => process.env.ELEVENLABS_API_KEY ?? "";

export function planChunks(l: Stage4Out) {
  const chunks: {
    movement: number;
    chunk: number;
    text: string;
    duration_ms: number;
    positive_styles: string[];
    negative_styles: string[];
    context_adherence: string;
  }[] = [];
  for (const m of l.movements) {
    for (const c of m.chunks) {
      chunks.push({
        movement: m.n,
        chunk: c.n,
        text: c.text, // already A5-normalized sung text
        duration_ms: c.duration_ms,
        positive_styles: c.positive_styles,
        negative_styles: c.negative_styles,
        context_adherence: c.context_adherence,
      });
    }
  }
  return chunks;
}

export async function makeTake(
  ctx: RunCtx,
  l: Stage4Out,
  seed: number,
): Promise<Take> {
  const body = {
    model_id: EL_MUSIC_MODEL,
    seed,
    sign_with_c2pa: true,
    composition_plan: { chunks: planChunks(l) },
  };
  const file = `media/takes/take-seed-${seed}.mp3`;
  const r = await elCall(
    ctx,
    EL_MUSIC_URL,
    body,
    file,
    { "xi-api-key": KEY() },
    false,
    `music:seed-${seed}`,
  );
  return {
    seed,
    file,
    request_sha: r.sha,
    status: r.status,
    headers: r.headers,
    bytes: r.body.length,
  };
}

export interface MusicResult {
  takes: Take[];
  error?: { seed: number; status?: number; body: string };
}

export async function stage5(
  ctx: RunCtx,
  l: Stage4Out,
  seeds: number[] = SEEDS,
): Promise<MusicResult> {
  mkdirSync("media/takes", { recursive: true });
  const takes: Take[] = [];
  for (const seed of seeds) {
    try {
      const t = await makeTake(ctx, l, seed);
      takes.push(t);
      console.log(`[stage5] seed ${seed}: ${t.bytes} bytes, status ${t.status}`);
    } catch (e: any) {
      const err = {
        seed,
        status: e?.status,
        body: String(e?.body ?? e),
      };
      console.error(`[stage5] seed ${seed} FAILED: ${err.status} ${err.body.slice(0, 300)}`);
      // stop this stage; report the exact error body
      writeFileSync(
        "out/stage5-error.json",
        JSON.stringify(err, null, 2) + "\n",
      );
      return { takes, error: err };
    }
  }
  writeFileSync(
    "media/takes/takes.json",
    JSON.stringify(
      takes.map((t) => ({
        seed: t.seed,
        file: t.file,
        request_sha: t.request_sha,
        status: t.status,
        song_id: t.headers["x-song-id"] ?? t.headers["song-id"] ?? null,
        bytes: t.bytes,
        mp3_sha256: sha256hex(readFileSync(t.file)),
      })),
      null,
      2,
    ) + "\n",
  );
  return { takes };
}

export function extraSeedsNeeded(score: number): boolean {
  return score < 0.45;
}
export { EXTRA_SEEDS };
