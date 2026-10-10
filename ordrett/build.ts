// Orðrétt: build a self-contained page from Samtal's table summaries.
//
//   bun ordrett/build.ts            render from the newest snapshot in ordrett/data
//   bun ordrett/build.ts --fetch    take a new snapshot from talasaman.is first,
//                                   and re-measure every recording with ffmpeg
//
// No model runs anywhere in this build. Recordings are downloaded only to a
// temporary directory to measure length and loudness, then deleted; the page
// streams them from talasaman.is.

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HERE = import.meta.dir;
const DATA = join(HERE, "data");
const API = "https://talasaman.is/api/v1/summaries";
const SILENT_DB = -60; // a recording whose loudest moment is below this is silent

type Row = {
  id: string;
  topic: string;
  topicChosen: boolean;
  summary: string;
  source: "lods" | "participant";
  audio: string | null;
  location: string;
  locationPostCode: string;
  table: number;
};
type Snapshot = { data: Row[]; meta: { generatedAt: string; count: number; attribution: string } };
type AudioFact = { seconds: number; maxDb: number; silent: boolean; activeDb: number; env: string };

const RATE = 8000;
const WINDOW = 400; // 50 ms: twenty loudness readings per second
const ALPH = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_"; // 64 levels

function newestSnapshot(): string {
  const files = readdirSync(DATA).filter((f) => /^summaries-.*\.json$/.test(f)).sort();
  if (!files.length) throw new Error("no snapshot in ordrett/data; run with --fetch");
  return join(DATA, files[files.length - 1]);
}

// Decode one recording to mono samples and measure it: length, loudest moment,
// typical speaking level, and a loudness envelope (RMS every 50 ms, lightly
// smoothed, scaled to its own peak) that the page draws as that voice's line.
function measure(file: string): Omit<AudioFact, "silent"> {
  const p = Bun.spawnSync(["ffmpeg", "-nostdin", "-v", "error", "-i", file, "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"]);
  if (p.exitCode !== 0) throw new Error(`ffmpeg could not decode ${file}`);
  const buf = p.stdout;
  const x = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  const n = Math.floor(x.length / WINDOW);
  const rms = new Float64Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = i * WINDOW; k < (i + 1) * WINDOW; k++) { s += x[k] * x[k]; peak = Math.max(peak, Math.abs(x[k])); }
    rms[i] = Math.sqrt(s / WINDOW);
  }
  const db = [...rms].map((v) => 20 * Math.log10(v + 1e-9)).sort((a, b) => a - b);
  const upper = db.slice(Math.floor(db.length / 2));
  const activeDb = upper.length ? upper.reduce((a, b) => a + b, 0) / upper.length : -180;
  const R = 3; // triangular smoothing over +-150 ms
  const sm = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, w = 0;
    for (let k = -R; k <= R; k++) { const j = i + k; if (j >= 0 && j < n) { const wt = R + 1 - Math.abs(k); s += rms[j] * wt; w += wt; } }
    sm[i] = s / w;
  }
  const top = Math.max(...sm, 1e-9);
  const env = [...sm].map((v) => ALPH[Math.round((v / top) * 63)]).join("");
  return {
    seconds: Math.round((x.length / RATE) * 100) / 100,
    maxDb: Math.round(20 * Math.log10(peak + 1e-9) * 100) / 100,
    activeDb: Math.round(activeDb * 100) / 100,
    env,
  };
}

async function fetchSnapshot(): Promise<string> {
  const res = await fetch(API, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${API} answered ${res.status}`);
  const body = (await res.json()) as Snapshot;
  if (!Array.isArray(body.data) || body.data.length !== body.meta.count) throw new Error("snapshot count mismatch");
  const stamp = body.meta.generatedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const path = join(DATA, `summaries-${stamp}.json`);
  writeFileSync(path, JSON.stringify(body, null, 1) + "\n");

  const tmp = mkdtempSync(join(tmpdir(), "ordrett-audio-"));
  const facts: Record<string, AudioFact> = {};
  try {
    for (const r of body.data.filter((r) => r.audio)) {
      const a = await fetch(r.audio!);
      if (!a.ok) throw new Error(`${r.audio} answered ${a.status}`);
      const f = join(tmp, `${r.id}.webm`);
      await Bun.write(f, a);
      const m = measure(f);
      facts[r.id] = { ...m, silent: m.maxDb < SILENT_DB };
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  writeFileSync(join(DATA, "audio-facts.json"), JSON.stringify({ measuredFor: body.meta.generatedAt, silentBelowDb: SILENT_DB, facts }, null, 1) + "\n");
  return path;
}

const font = (name: string) => readFileSync(join(HERE, "fonts", name)).toString("base64");

const snapPath = process.argv.includes("--fetch") ? await fetchSnapshot() : newestSnapshot();
const snap = JSON.parse(readFileSync(snapPath, "utf8")) as Snapshot;
const audio = JSON.parse(readFileSync(join(DATA, "audio-facts.json"), "utf8"));
if (audio.measuredFor !== snap.meta.generatedAt) throw new Error("audio-facts.json was measured for a different snapshot; run with --fetch");

// What the page needs per recording: length, silent or not, a playback gain that
// brings every voice to the same speaking level (-20 dBFS, within +-9 dB), and
// its loudness envelope.
const TARGET_DB = -20;
const facts: Record<string, [number, 0 | 1, number, string]> = {};
for (const [id, f] of Object.entries(audio.facts as Record<string, AudioFact>)) {
  const gain = f.silent ? 0 : Math.round(Math.max(-9, Math.min(9, TARGET_DB - f.activeDb)) * 10) / 10;
  facts[id] = [f.seconds, f.silent ? 1 : 0, gain, f.silent ? "" : f.env];
}

// Escape "<" so no summary text can close the inline <script>.
const json = (v: unknown) =>
  JSON.stringify(v)
    .replace(/</g, "\\u003c")
    .replace(/[\u2028\u2029]/g, (c) => "\\u" + c.charCodeAt(0).toString(16));

// Replacer functions, so a "$" in the data is never read as a replacement pattern.
const page = readFileSync(join(HERE, "page.html"), "utf8")
  .replace("/*FONT_WORDS*/", () => font("atkinson-hyperlegible-next-latin.woff2"))
  .replace("/*FONT_FRAME*/", () => font("schibsted-grotesk-latin.woff2"))
  .replace("/*SNAPSHOT*/", () => json(snap))
  .replace("/*AUDIO*/", () => json(facts));
const left = page.match(/\/\*[A-Z_]+\*\//g);
if (left) throw new Error(`unfilled placeholders: ${left.join(", ")}`);
// Orðrétt is the site's front page; the record of how it came to be sits beside it.
const SITE = join(HERE, "..", "site");
writeFileSync(join(SITE, "index.html"), page);
const saga = readFileSync(join(HERE, "saga.html"), "utf8")
  .replace("/*FONT_WORDS*/", () => font("atkinson-hyperlegible-next-latin.woff2"))
  .replace("/*FONT_FRAME*/", () => font("schibsted-grotesk-latin.woff2"));
writeFileSync(join(SITE, "saga.html"), saga);
console.log(`site/index.html  ${snap.data.length} summaries  snapshot ${snap.meta.generatedAt}  ${(page.length / 1024).toFixed(0)} KB; site/saga.html ${(saga.length / 1024).toFixed(0)} KB`);
