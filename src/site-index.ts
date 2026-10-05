// site/index.html — landing: poster frame, three doors, credits.

import { bi } from "./strings";
import { chrome, footer, htmlShell } from "./site-common";

const esc = (s: string) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function indexHtml(): string {
  const biP = (k: string) => {
    const v = bi(k);
    return `<span class="bi-is">${esc(v.is)}</span><span class="bi-en">${esc(v.en)}</span><span class="bi-zh">${esc(v.zh)}</span>`;
  };
  const body = `
${chrome("is", "home")}
<main class="landing">
  <div class="hero">
    <img src="poster.png" alt="Samhljómur" class="poster">
    <div class="hero-text">
      <h1>Samhljómur</h1>
      <p class="sub">${biP("subtitle")}</p>
      <p class="tag">${biP("tagline")}</p>
      <p class="ded">${biP("dedication")}</p>
    </div>
  </div>
  <div class="doors">
    <a class="door" href="video.html"><span class="dttl">${biP("door_video")}</span><span class="ddsc">${biP("door_video_desc")}</span></a>
    <a class="door" href="report.html"><span class="dttl">${biP("door_report")}</span><span class="ddsc">${biP("door_report_desc")}</span></a>
    <a class="door" href="songbook.html"><span class="dttl">${biP("door_songbook")}</span><span class="ddsc">${biP("door_songbook_desc")}</span></a>
  </div>
  <p class="disc">${biP("disclaimer")}</p>
</main>
${footer("is")}
<style>
.landing{max-width:960px}
.hero{position:relative;border-radius:14px;overflow:hidden;border:1px solid var(--line);margin-top:26px}
.poster{width:100%;display:block;aspect-ratio:16/9;object-fit:cover;background:#0B1426}
.hero-text{position:absolute;left:0;right:0;bottom:0;padding:26px;background:linear-gradient(transparent,rgba(6,10,20,.86))}
.hero-text h1{font-family:Fraunces,serif;font-weight:600;font-size:44px}
.hero-text .sub{color:#c7ccd9}
.hero-text .tag{font-size:13px;color:var(--dim);margin-top:6px}
.hero-text .ded{font-size:12.5px;color:#b8a878;margin-top:10px;font-style:italic}
.doors{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:26px 0}
.door{border:1px solid var(--line);border-radius:12px;padding:18px;text-decoration:none;color:var(--ink);background:#0d1730;transition:border-color .15s}
.door:hover{border-color:var(--accent)}
.dttl{font-family:Fraunces,serif;font-size:20px;font-weight:600;display:block;margin-bottom:6px}
.ddsc{font-size:12.5px;color:var(--dim)}
.disc{font-size:12px;color:var(--dim)}
@media(max-width:760px){.doors{grid-template-columns:1fr}.hero-text h1{font-size:30px}}
</style>`;
  return htmlShell({
    title: bi("site_title").is,
    titleOther: bi("subtitle").en,
    body,
  });
}
