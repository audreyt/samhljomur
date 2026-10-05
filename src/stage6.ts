// Stage 6: ElevenLabs Scribe v2 word-level transcription + alignment.
// Normalize (lowercase, strip punctuation, NFC); per-chunk LCS alignment of
// expected sung words vs transcript words inside the chunk's plan window;
// line start/end = first/last matched word; unmatched lines spread evenly in
// the gap. Take score = mean line fidelity (tie -> higher min). Best < 0.45
// triggers up to 2 extra seeds (4, 5).

import { readFileSync, writeFileSync } from "node:fs";
import { elCall, RunCtx } from "./model";
import { EL_STT_URL, sungText } from "./spec";
import { Stage4Out } from "./stage4";
import { Take } from "./stage5";

export interface Word {
  text: string;
  start: number;
  end: number;
  type?: string;
}

export interface LineTiming {
  n: number;
  text: string;
  source: string;
  start_s: number;
  end_s: number;
  fidelity: number | null; // null in placeholder mode
  expected_words: number;
  matched_words: number;
}

export interface ChunkTiming {
  movement: number;
  chunk: number;
  title_is: string;
  section?: string;
  start_s: number;
  end_s: number;
  duration_ms: number;
  lines: LineTiming[];
}

export interface TakeScore {
  seed: number;
  file: string;
  score: number;
  min_fidelity: number;
  stt_sha?: string;
}

export interface Timeline {
  attribution: string;
  disclaimer_is: string;
  disclaimer_en: string;
  placeholder: boolean;
  takes: TakeScore[];
  chosen_seed: number | null;
  chosen_file: string | null;
  total_duration_s: number;
  chunks: ChunkTiming[];
}

const KEY = () => process.env.ELEVENLABS_API_KEY ?? "";

// Fixed-boundary multipart body so the request sha is deterministic.
function multipartBody(
  fields: Record<string, string>,
  fileField: string,
  filename: string,
  fileBytes: Buffer,
): Buffer {
  const B = "samhljomurBoundary0x1";
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${B}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
      ),
    );
  }
  parts.push(
    Buffer.from(
      `--${B}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\nContent-Type: audio/mpeg\r\n\r\n`,
    ),
  );
  parts.push(fileBytes);
  parts.push(Buffer.from(`\r\n--${B}--\r\n`));
  return Buffer.concat(parts);
}

export async function scribe(
  ctx: RunCtx,
  takeFile: string,
  seed: number,
): Promise<Word[]> {
  const fileBytes = readFileSync(takeFile);
  const body = multipartBody(
    {
      model_id: "scribe_v2",
      language_code: "is",
      timestamps_granularity: "word",
      tag_audio_events: "false",
    },
    "file",
    `take-seed-${seed}.mp3`,
    fileBytes,
  );
  const cacheJson = `media/takes/take-seed-${seed}.scribe.json`;
  const r = await elCall(
    ctx,
    EL_STT_URL,
    body,
    cacheJson,
    {
      "xi-api-key": KEY(),
      "Content-Type": "multipart/form-data; boundary=samhljomurBoundary0x1",
    },
    true,
    `scribe:seed-${seed}`,
  );
  const parsed = JSON.parse(r.body.toString("utf8"));
  const words: Word[] = (parsed.words ?? []).filter(
    (w: Word) => (w.type ?? "word") === "word",
  );
  return words;
}

// ---------- alignment ----------

export function normalizeWord(w: string): string {
  return w
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function wordsOf(text: string): string[] {
  return sungText(text)
    .split(/\s+/)
    .map(normalizeWord)
    .filter((w) => w.length > 0);
}

// LCS alignment of expected vs transcript words; returns map expected index ->
// transcript index.
function alignWords(expected: string[], heard: string[]): Map<number, number> {
  const n = expected.length;
  const m = heard.length;
  const dp: Uint32Array[] = [];
  for (let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        expected[i] === heard[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const map = new Map<number, number>();
  let i = 0,
    j = 0;
  while (i < n && j < m) {
    if (expected[i] === heard[j]) {
      map.set(i, j);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return map;
}

interface ExpWord {
  word: string;
  lineIdx: number; // index into chunk.lines
}

export function alignTake(
  l: Stage4Out,
  words: Word[],
): { chunks: ChunkTiming[]; score: number; min: number } {
  // cumulative chunk windows from the plan durations
  const chunks: ChunkTiming[] = [];
  let t = 0;
  for (const m of l.movements) {
    for (const c of m.chunks) {
      const lines: LineTiming[] = c.line_indices.map((li) => {
        const line = m.lines[li - 1];
        return {
          n: line.n,
          text: line.text,
          source: line.source,
          start_s: 0,
          end_s: 0,
          fidelity: 0,
          expected_words: 0,
          matched_words: 0,
        };
      });
      chunks.push({
        movement: m.n,
        chunk: c.n,
        title_is: c.title_is,
        section: c.section,
        start_s: t,
        end_s: t + c.duration_ms / 1000,
        duration_ms: c.duration_ms,
        lines,
      });
      t += c.duration_ms / 1000;
    }
  }

  const fids: number[] = [];
  for (const ch of chunks) {
    const mov = l.movements[ch.movement - 1];
    // expected words across the chunk, tagged by line
    const exp: ExpWord[] = [];
    ch.lines.forEach((ln, i) => {
      const line = mov.lines[ln.n - 1];
      for (const w of wordsOf(line.sung ?? line.text))
        exp.push({ word: w, lineIdx: i });
      ln.expected_words = wordsOf(line.sung ?? line.text).length;
    });
    // transcript words inside the chunk window
    const win = words.filter(
      (w) => w.start >= ch.start_s - 0.01 && w.start < ch.end_s + 0.01,
    );
    const heard = win.map((w) => normalizeWord(w.text));
    const keep: number[] = [];
    heard.forEach((w, i) => {
      if (w.length) keep.push(i);
    });
    const heardW = keep.map((i) => heard[i]);
    const map = alignWords(
      exp.map((e) => e.word),
      heardW,
    );
    // per line: matched words + time bounds
    const lineMatch: { idx: number; w: Word }[][] = ch.lines.map(() => []);
    for (const [ei, hi] of map) {
      lineMatch[exp[ei].lineIdx].push({ idx: hi, w: win[keep[hi]] });
    }
    ch.lines.forEach((ln, i) => {
      const matches = lineMatch[i];
      ln.matched_words = matches.length;
      ln.fidelity = ln.expected_words
        ? matches.length / ln.expected_words
        : 0;
      if (matches.length) {
        ln.start_s = matches[0].w.start;
        ln.end_s = matches[matches.length - 1].w.end;
      }
    });
    // spread unmatched lines evenly in the gap between matched neighbours
    let i = 0;
    while (i < ch.lines.length) {
      if (ch.lines[i].matched_words > 0) {
        i++;
        continue;
      }
      let j = i;
      while (j < ch.lines.length && ch.lines[j].matched_words === 0) j++;
      const prevEnd = i > 0 ? ch.lines[i - 1].end_s : ch.start_s;
      const nextStart =
        j < ch.lines.length ? ch.lines[j].start_s : ch.end_s;
      const gap = j - i;
      for (let k = 0; k < gap; k++) {
        const a = prevEnd + ((nextStart - prevEnd) * (k + 1)) / (gap + 1);
        const b = prevEnd + ((nextStart - prevEnd) * (k + 2)) / (gap + 1);
        ch.lines[i + k].start_s = a;
        ch.lines[i + k].end_s = b;
      }
      i = j;
    }
    for (const ln of ch.lines) fids.push(ln.fidelity ?? 0);
  }
  const score = fids.length ? fids.reduce((a, b) => a + b, 0) / fids.length : 0;
  const min = fids.length ? Math.min(...fids) : 0;
  return { chunks, score, min };
}

// Placeholder timeline when the music API is unavailable: lines spread
// evenly inside each chunk window, fidelity null.
export function placeholderTimeline(l: Stage4Out): Timeline {
  const chunks: ChunkTiming[] = [];
  let t = 0;
  for (const m of l.movements) {
    for (const c of m.chunks) {
      const dur = c.duration_ms / 1000;
      const n = c.line_indices.length;
      const lines: LineTiming[] = c.line_indices.map((li, i) => {
        const line = m.lines[li - 1];
        return {
          n: line.n,
          text: line.text,
          source: line.source,
          start_s: t + (dur * i) / n,
          end_s: t + (dur * (i + 1)) / n,
          fidelity: null,
          expected_words: 0,
          matched_words: 0,
        };
      });
      chunks.push({
        movement: m.n,
        chunk: c.n,
        title_is: c.title_is,
        section: c.section,
        start_s: t,
        end_s: t + dur,
        duration_ms: c.duration_ms,
        lines,
      });
      t += dur;
    }
  }
  return {
    attribution:
      "Gögn: Samtal, félag til almannaheilla (talasaman.is), CC BY 4.0",
    disclaimer_is: "Þetta er hvorki afstaða né niðurstaða Samtals.",
    disclaimer_en: "This is not Samtal's position or finding.",
    placeholder: true,
    takes: [],
    chosen_seed: null,
    chosen_file: null,
    total_duration_s: t,
    chunks,
  };
}

export async function stage6(
  ctx: RunCtx,
  l: Stage4Out,
  takes: Take[],
): Promise<Timeline> {
  const scores: TakeScore[] = [];
  let best: { chunks: ChunkTiming[]; score: number; min: number } | null = null;
  let bestSeed: number | null = null;
  let bestFile: string | null = null;
  for (const t of takes) {
    const words = await scribe(ctx, t.file, t.seed);
    const a = alignTake(l, words);
    scores.push({
      seed: t.seed,
      file: t.file,
      score: a.score,
      min_fidelity: a.min,
      stt_sha: undefined,
    });
    console.log(
      `[stage6] seed ${t.seed}: score ${a.score.toFixed(3)} (min ${a.min.toFixed(3)})`,
    );
    if (
      !best ||
      a.score > best.score ||
      (a.score === best.score && a.min > best.min)
    ) {
      best = a;
      bestSeed = t.seed;
      bestFile = t.file;
    }
  }
  const tl: Timeline = {
    attribution:
      "Gögn: Samtal, félag til almannaheilla (talasaman.is), CC BY 4.0",
    disclaimer_is: "Þetta er hvorki afstaða né niðurstaða Samtals.",
    disclaimer_en: "This is not Samtal's position or finding.",
    placeholder: false,
    takes: scores,
    chosen_seed: bestSeed,
    chosen_file: bestFile,
    total_duration_s: best
      ? Math.max(...best.chunks.map((c) => c.end_s))
      : 0,
    chunks: best?.chunks ?? [],
  };
  return tl;
}

export function writeTimeline(tl: Timeline) {
  writeFileSync("out/timeline.json", JSON.stringify(tl, null, 2) + "\n");
}
