// Orðrétt: build a self-contained page from Samtal's table summaries.
//
//   bun ordrett/build.ts            render from the newest snapshot in ordrett/data
//   bun ordrett/build.ts --fetch    take a new snapshot from talasaman.is first,
//                                   and re-measure every recording with ffmpeg
//   bun ordrett/build.ts --images   also redraw the share card and the home-screen
//                                   icon (done anyway with --fetch, or when missing)
//
// No model runs anywhere in this build. Recordings are downloaded only to a
// temporary directory to measure length and loudness, then deleted; the page
// streams them from talasaman.is.

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

// The ð of the title (Schibsted Grotesk at weight 850), in a 32-unit square.
const ETH = "M15.97 26.5Q13.8 26.5 12.16 25.62Q10.51 24.74 9.58 23.17Q8.64 21.61 8.64 19.57Q8.64 17.52 9.55 15.96Q10.46 14.4 11.97 13.52Q13.49 12.64 15.3 12.64Q16.49 12.64 17.22 12.99Q17.95 13.35 18.38 13.9Q18.82 14.44 19.12 14.99L18.92 15.48Q18.34 13.7 17.29 12.38Q16.24 11.06 15 10.14Q13.76 9.22 12.6 8.64Q11.43 8.05 10.62 7.75L11.55 5.5Q13.1 6.05 14.75 6.82Q16.39 7.59 17.93 8.64Q19.47 9.7 20.69 11.1Q21.91 12.5 22.64 14.31Q23.36 16.12 23.36 18.4Q23.36 20.92 22.44 22.73Q21.53 24.54 19.87 25.52Q18.21 26.5 15.97 26.5ZM16.01 23Q17.04 23 17.64 22.08Q18.24 21.15 18.24 19.57Q18.24 17.98 17.64 17.06Q17.04 16.13 16.01 16.13Q14.97 16.13 14.37 17.06Q13.76 17.98 13.76 19.57Q13.76 21.16 14.37 22.08Q14.97 23 16.01 23ZM11.87 12.87 10.66 10.73 19.72 5.58 20.94 7.72Z";
// Rounded for a browser tab; square for a home screen, which rounds it itself.
const icon = (rx: number) =>
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='${rx}' fill='#0d0e0c'/><path d='${ETH}' fill='#ecebe3'/></svg>`;

// Replacer functions, so a "$" in the data is never read as a replacement pattern.
const fill = (file: string, more: Record<string, string> = {}) => {
  let html = readFileSync(join(HERE, file), "utf8")
    .replace("/*FONT_WORDS*/", () => font("atkinson-hyperlegible-next-latin.woff2"))
    .replace("/*FONT_FRAME*/", () => font("schibsted-grotesk-latin.woff2"))
    .replace("/*ICON*/", () => encodeURIComponent(icon(7)));
  for (const [k, v] of Object.entries(more)) html = html.replace(`/*${k}*/`, () => v);
  const left = html.match(/\/\*[A-Z_]+\*\//g);
  if (left) throw new Error(`${file}: unfilled placeholders: ${left.join(", ")}`);
  return html;
};
const page = fill("page.html", { SNAPSHOT: json(snap), AUDIO: json(facts) });
// Orðrétt is the site's front page; the record of how it came to be sits beside it.
const SITE = join(HERE, "..", "site");
writeFileSync(join(SITE, "index.html"), page);
const saga = fill("saga.html");
writeFileSync(join(SITE, "saga.html"), saga);
console.log(`site/index.html  ${snap.data.length} summaries  snapshot ${snap.meta.generatedAt}  ${(page.length / 1024).toFixed(0)} KB; site/saga.html ${(saga.length / 1024).toFixed(0)} KB`);

// The share card: the page's mountain under its title, drawn as the page draws
// it (layoutMountain): one line per audible recording, shortest on top, width
// proportional to length, the loudest reading under each pixel, each line
// hiding what rises behind it.
function mountainSvg(W: number, gap: number, stroke: number) {
  const coll = new Intl.Collator("is");
  const rank = new Map(snap.data.map((r, i) => ({ r, i })).sort((a, b) =>
    ((parseInt(a.r.locationPostCode, 10) || 99999) - (parseInt(b.r.locationPostCode, 10) || 99999)) ||
    coll.compare(String(a.r.location), String(b.r.location)) || ((a.r.table ?? 0) - (b.r.table ?? 0)) || (a.i - b.i)).map((x, k) => [x.r.id, k]));
  const lines = snap.data.filter((r) => r.audio && facts[r.id] && !facts[r.id][1] && facts[r.id][3])
    .map((r) => ({ id: r.id, s: facts[r.id][0], env: [...facts[r.id][3]].map((c) => ALPH.indexOf(c) / 63) }))
    .sort((a, b) => a.s - b.s || rank.get(a.id)! - rank.get(b.id)!);
  const amp = gap * 2.7, top = Math.ceil(amp + 4), H = Math.ceil(top + gap * (lines.length - 1) + 6);
  const maxS = Math.max(...lines.map((l) => l.s)), f = (v: number) => +v.toFixed(1);
  const paths = lines.map((L, i) => {
    const w = W * L.s / maxS, x0 = (W - w) / 2, y0 = top + i * gap, m = Math.max(2, Math.round(w)), e = L.env, dx = w / (m - 1);
    const pts: string[] = [];
    for (let j = 0; j < m; j++) {
      const a = Math.floor(j * e.length / m), b = Math.max(a + 1, Math.floor((j + 1) * e.length / m));
      let v = 0;
      for (let k = a; k < b && k < e.length; k++) v = Math.max(v, e[k]);
      pts.push(f(x0 + j * dx) + " " + f(y0 - v * amp));
    }
    const curve = pts.join(" ");
    return `<path d="M${f(x0)} ${f(y0)}L${curve}L${f(x0 + w)} ${f(y0 + 1.5)}H${f(x0)}Z" fill="#0d0e0c"/>` +
      `<path d="M0 ${f(y0)}H${f(x0)}L${curve}L${f(x0 + w)} ${f(y0)}H${W}" fill="none" stroke="#ecebe3" stroke-width="${stroke}" stroke-linejoin="round"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${paths.join("")}</svg>`;
}
const card = `<!doctype html><html lang="is"><meta charset="utf-8"><style>
@font-face { font-family: F; src: url(data:font/woff2;base64,${font("schibsted-grotesk-latin.woff2")}) format("woff2"); font-weight: 400 900; }
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #0d0e0c; color: #ecebe3; }
body { box-sizing: border-box; padding: 56px 64px 44px; display: grid; grid-template-rows: auto 1fr; align-items: end; font-family: F; }
p { margin: 0 0 22px; font-weight: 600; font-size: 21px; letter-spacing: .08em; text-transform: uppercase; color: #979c93; }
h1 { margin: 0 0 0 -.04em; font-weight: 850; font-size: 168px; line-height: .8; letter-spacing: -.05em; }
svg { display: block; }
</style><body><div><p>Samtalið · 10. október 2026</p><h1>Orðrétt</h1></div>${mountainSvg(1072, 13.5, 1.6)}</body></html>`;

const CARD = join(SITE, "ordrett-card.png"), ICON = join(SITE, "ordrett-icon.png");
if (["--images", "--fetch"].some((a) => process.argv.includes(a)) || !existsSync(CARD) || !existsSync(ICON)) {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } });
      await tab.setContent(card);
      await tab.evaluate(() => document.fonts.ready);
      await tab.screenshot({ path: CARD });
      await tab.setViewportSize({ width: 180, height: 180 });
      await tab.setContent(`<body style="margin:0">${icon(0).replace("<svg ", "<svg width='180' height='180' ")}</body>`);
      await tab.screenshot({ path: ICON });
      console.log("site/ordrett-card.png 1200 x 630; site/ordrett-icon.png 180 x 180");
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.log(`share card and icon not drawn (needs Playwright with Chromium): ${(e as Error).message.split("\n")[0]}`);
  }
}
