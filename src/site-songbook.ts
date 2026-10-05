// site/songbook.html + songbook.pdf — lyric sheet by movement, A5 print-clean.

import { bi } from "./strings";
import { fontCss } from "./site-common";
import { Stage4Out } from "./stage4";

const esc = (s: string) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const enClean = (s: string) => s.replace(/\s*[—–]\s*/g, ", ");
const escE = (s: string) => esc(enClean(s));

export function songbookHtml(lyrics: Stage4Out): string {
  const biP = (k: string) =>
    `<span class="bi-is">${esc(bi(k).is)}</span><span class="bi-en">${esc(bi(k).en)}</span>`;

  const movHtml = lyrics.movements
    .map((m) => {
      const lines = m.lines
        .map((l) => {
          const cnt = (l.count ?? 0) >= 2 ? `<span class="cnt">×${l.count}</span>` : "";
          const ed = l.editorial
            ? `<div class="ed"><span class="bi-is">${esc(l.editorial.reason_is)}</span><span class="bi-en">${esc(l.editorial.reason_en)}</span></div>`
            : "";
          const tag =
            l.kind === "refrain"
              ? `<span class="tag">${biP("tag_refrain")}</span>`
              : l.kind === "tagline"
                ? `<span class="tag">${biP("tagline_label")}</span>`
                : l.kind === "topics"
                  ? `<span class="tag">${biP("tag_topics")}</span>`
                  : "";
          const src =
            l.kind === "tagline"
              ? ""
              : `<div class="src">${esc(l.source)}${l.url ? ` · <a href="${l.url}">talasaman.is</a>` : ""}</div>`;
          const gl = l.gloss?.en
            ? `<div class="gl">${escE(l.gloss.en)} <span class="glbl">${l.gloss.edited ? esc(bi("gloss_edited").is) : esc(bi("gloss_label").is)}</span></div>`
            : "";
          return `<div class="line ${l.kind}">
  <div class="ln"><span class="no">${l.n}.</span><span class="txt">${esc(l.text)}${cnt}</span></div>
  ${gl}${tag}${ed}${src}
</div>`;
        })
        .join("\n");
      return `<section class="mov">
<h2><span class="no">${m.n}</span> <span class="bi-is">${esc(m.title_is)}</span><span class="bi-en">${esc(m.title_en)}</span></h2>
${lines}
</section>`;
    })
    .join("\n");

  return `<!doctype html><html lang="is"><head><meta charset="utf-8">
<title>${esc(bi("songbook_title").is)} · Samhljómur</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${fontCss()}</style>
<style>
body{font-family:Inter,system-ui,sans-serif;color:#1c2028;background:#fff;max-width:130mm;margin:0 auto;padding:14mm 12mm;line-height:1.45}
h1{font-family:Fraunces,serif;font-weight:600;font-size:24pt;margin-bottom:2mm}
.intro{font-size:9pt;color:#555;margin-bottom:8mm}
h2{font-family:Fraunces,serif;font-weight:600;font-size:15pt;margin:9mm 0 3mm;border-bottom:1px solid #ddd;padding-bottom:1.5mm;break-after:avoid}
h2 .no{color:#999;font-size:10pt;margin-right:2mm}
.mov{break-inside:auto}
.line{margin:3mm 0;break-inside:avoid}
.ln .no{color:#999;font-size:8pt;margin-right:1.5mm;vertical-align:super}
.txt{font-family:Fraunces,serif;font-size:11.5pt;font-weight:600}
.cnt{color:#8a6a20;font-size:8pt;margin-left:1.5mm}
.gl{font-size:8.5pt;color:#666;margin-top:.6mm}
.glbl{font-size:7pt;color:#999;border:0.2pt solid #ccc;border-radius:2pt;padding:0 2pt;margin-left:1mm}
.tag{font-size:7.5pt;color:#855;background:#f6efe4;border-radius:2pt;padding:.5pt 3pt;display:inline-block;margin-top:1mm}
.ed{font-size:7.5pt;color:#777;font-style:italic;margin-top:.8mm}
.src{font-size:7pt;color:#aaa;margin-top:.8mm}
.src a{color:#aaa}
footer{margin-top:10mm;border-top:1px solid #ddd;padding-top:3mm;font-size:7.5pt;color:#888}
@media print{body{max-width:none;width:130mm;padding:0}}
@page{size:A5 portrait;margin:12mm}
.bi-en{display:none}
body.en .bi-en{display:inline}
body.en .bi-is{display:none}
#langbtn{position:fixed;top:8px;right:10px;border:1px solid #ccc;background:#fff;border-radius:6px;padding:4px 10px;font:inherit;font-size:8pt;cursor:pointer}
@media print{#langbtn{display:none}}
</style></head><body>
<button id="langbtn" onclick="document.body.classList.toggle('en')">${esc(bi("lang_switch").is)}</button>
<h1>${esc(bi("songbook_title").is)}</h1>
<p class="intro"><span class="bi-is">${esc(bi("songbook_intro").is)}</span><span class="bi-en">${esc(bi("songbook_intro").en)}</span></p>
${movHtml}
<footer>
<div>${esc(bi("attribution").is)}</div>
<div>${esc(bi("disclaimer").is)} · ${esc(bi("disclaimer").en)}</div>
<div>${esc(bi("gift").is)} · ${esc(bi("editor_credit").is)}</div>
</footer>
</body></html>`;
}
