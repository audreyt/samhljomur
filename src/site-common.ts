// Shared bits for the site pages: fonts, chrome, language toggle, coastline.

import { readFileSync, readdirSync } from "node:fs";
import { bi } from "./strings";

// Fonts: woff2 embedded as data URIs (OFL). Fraunces = lyrics/display,
// Inter = UI. latin + latin-ext (Icelandic þ ð æ ö live in latin-ext).
export function fontCss(): string {
  const faces: { fam: string; wght: number; subset: string }[] = [
    { fam: "fraunces", wght: 400, subset: "latin" },
    { fam: "fraunces", wght: 400, subset: "latin-ext" },
    { fam: "fraunces", wght: 600, subset: "latin" },
    { fam: "fraunces", wght: 600, subset: "latin-ext" },
    { fam: "inter", wght: 400, subset: "latin" },
    { fam: "inter", wght: 400, subset: "latin-ext" },
    { fam: "inter", wght: 500, subset: "latin" },
    { fam: "inter", wght: 500, subset: "latin-ext" },
    { fam: "inter", wght: 600, subset: "latin" },
    { fam: "inter", wght: 600, subset: "latin-ext" },
  ];
  return faces
    .map((f) => {
      const file = `assets/fonts/${f.fam}-${f.wght}-${f.subset}.woff2`;
      const b64 = readFileSync(file).toString("base64");
      const fam = f.fam === "fraunces" ? "Fraunces" : "Inter";
      const urange =
        f.subset === "latin"
          ? "U+0000-00FF,U+0131,U+0152-0153,U+2BB0-2C61,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
          : "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";
      return `@font-face{font-family:'${fam}';font-style:normal;font-weight:${f.wght};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2');unicode-range:${urange};}`;
    })
    .join("\n");
}

export function icelandPath(): string {
  // equirectangular projection x = lng*cos65, y = -lat; returns an SVG path
  // string in a normalized coordinate box (to be scaled by the consumer).
  const geo = JSON.parse(readFileSync("assets/geo/iceland-50m.json", "utf8"));
  const COS = Math.cos((65 * Math.PI) / 180);
  const pts: [number, number][] = geo.coordinates[0].map(
    (c: number[]) => [c[0] * COS, -c[1]] as [number, number],
  );
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = maxX - minX;
  const h = maxY - minY;
  const S = 1000 / Math.max(w, h);
  const d = pts
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${((p[0] - minX) * S).toFixed(1)},${((p[1] - minY) * S).toFixed(1)}`,
    )
    .join("");
  return d + "Z";
}

export function projectLngLat(lng: number, lat: number): [number, number] {
  const COS = Math.cos((65 * Math.PI) / 180);
  return [lng * COS, -lat];
}

// returns [minX,minY,scale] matching icelandPath's normalization
export function mapTransform(): { minX: number; minY: number; S: number } {
  const geo = JSON.parse(readFileSync("assets/geo/iceland-50m.json", "utf8"));
  const pts: [number, number][] = geo.coordinates[0].map(
    (c: number[]) => [c[0] * Math.cos((65 * Math.PI) / 180), -c[1]] as [
      number,
      number,
    ],
  );
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, minY, S: 1000 / Math.max(maxX - minX, maxY - minY) };
}

export const BASE_CSS = `
:root{--bg:#0B1426;--ink:#EDEAE2;--dim:#9aa3b5;--line:#26314a;--accent:#8fd8c4;--warm:#e8c47c}
*{box-sizing:border-box;margin:0;padding:0}
html{background:var(--bg)}
body{font-family:Inter,system-ui,sans-serif;color:var(--ink);background:var(--bg);line-height:1.55}
a{color:var(--accent)}
.mono{font-variant-numeric:tabular-nums}
.badge{display:inline-block;background:#26314a;border-radius:4px;padding:0 .35em;font-size:.8em;color:var(--dim)}
.badge.edit{background:#4a3a26;color:var(--warm)}
.is{} .en{}
body.lang-is .en-only{display:none!important}
body.lang-en .is-only{display:none!important}
body.lang-is .bi-en{display:none}
body.lang-en .bi-is{display:none}
header.site{padding:18px 24px;display:flex;align-items:baseline;gap:18px;border-bottom:1px solid var(--line);flex-wrap:wrap}
header.site .wm{font-family:Fraunces,serif;font-size:22px;font-weight:600;letter-spacing:.02em}
header.site .sub{color:var(--dim);font-size:13px}
header.site nav{margin-left:auto;display:flex;gap:10px;font-size:13px;align-items:center}
header.site nav a{color:var(--ink);text-decoration:none;border:1px solid var(--line);border-radius:6px;padding:4px 10px}
header.site nav a:hover{border-color:var(--accent)}
#langbtn{cursor:pointer;border:1px solid var(--line);background:none;color:var(--ink);border-radius:6px;padding:4px 10px;font:inherit;font-size:13px}
footer.site{margin-top:48px;padding:16px 24px;border-top:1px solid var(--line);font-size:11.5px;color:var(--dim);display:flex;gap:18px;flex-wrap:wrap}
h2.sec{font-family:Fraunces,serif;font-weight:600;font-size:26px;margin:38px 0 10px}
main{max-width:1080px;margin:0 auto;padding:0 24px}
p.lead{color:#c7ccd9;max-width:72ch}
table.data{border-collapse:collapse;width:100%;font-size:13px;margin:12px 0}
table.data th,table.data td{border:1px solid var(--line);padding:5px 9px;text-align:left;vertical-align:top}
table.data th{background:#111c33;font-weight:500}
.small{font-size:12px;color:var(--dim)}
`;

// header/footer chrome; `path` = "" for depth-0 pages
export function chrome(lang: "is" | "en", active: string): string {
  const t = (k: string) => (lang === "is" ? bi(k).is : bi(k).en);
  const doors: [string, string, string][] = [
    ["video.html", "door_video", "video"],
    ["report.html", "door_report", "report"],
    ["songbook.html", "door_songbook", "songbook"],
  ];
  const nav = doors
    .map(([href, key, id]) => {
      const cur = id === active ? ' style="border-color:var(--accent)"' : "";
      return `<a href="${href}"${cur}>${t(key)}</a>`;
    })
    .join("");
  return `<header class="site"><span class="wm">Samhljómur</span>
<span class="sub">${t("subtitle")}</span>
<nav>${nav}<button id="langbtn" onclick="toggleLang()">${t("lang_switch")}</button></nav></header>`;
}

export function footer(lang: "is" | "en"): string {
  const t = (k: string) => (lang === "is" ? bi(k).is : bi(k).en);
  return `<footer class="site">
<span>${t("attribution")}</span>
<span>${t("disclaimer")}</span>
<span>${t("gift")} · ${t("editor_credit")}</span>
</footer>`;
}

export const LANG_JS = `
function toggleLang(){
  const b=document.body;
  const en=b.classList.contains('lang-en');
  b.classList.toggle('lang-en',!en);b.classList.toggle('lang-is',en);
  try{localStorage.setItem('samhljomur-lang',en?'is':'en')}catch(e){}
  document.dispatchEvent(new Event('langchange'));
}
try{const l=localStorage.getItem('samhljomur-lang');if(l==='en'){document.documentElement.classList.add('pre-en')}}catch(e){}
`;

export function htmlShell(opts: {
  title: string;
  titleOther: string;
  bodyClass?: string;
  head?: string;
  body: string;
}): string {
  return `<!doctype html>
<html lang="is">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${opts.title === "Samhljómur" ? opts.title : `${opts.title} · Samhljómur`}</title>
<meta name="description" content="${opts.titleOther}">
<style>${fontCss()}</style>
<style>${BASE_CSS}</style>
${opts.head ?? ""}
</head>
<body class="lang-is ${opts.bodyClass ?? ""}">
<script>${LANG_JS}if(document.documentElement.classList.contains('pre-en')){document.addEventListener('DOMContentLoaded',()=>toggleLang())}</script>
${opts.body}
</body>
</html>`;
}
