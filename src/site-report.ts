// site/report.html — "Hvað sögðu þau?" / "What did they say?"

import { readFileSync } from "node:fs";
import { bi, S } from "./strings";
import { TRANSLATORS } from "./spec";
import { chrome, footer, htmlShell, icelandPath, mapTransform } from "./site-common";
import { Judgments } from "./stage1";
import { Glosses } from "./stage2";
import { Stage4Out } from "./stage4";
import { Calibration } from "./stage3";
import { Timeline } from "./stage6";

const esc = (s: string) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
// authored copy carries no em/en dashes (lead rule); participant IS text is untouched
const enClean = (s: string) => s.replace(/\s*[—–]\s*/g, ", ");
const escE = (s: string) => esc(enClean(s));

const THEME_COLORS: Record<string, string> = {
  nature: "#6fbf73",
  stillness: "#7fa8d8",
  memory: "#c9a1e8",
  home: "#e8c47c",
  community: "#e8876f",
  activity: "#8fd8c4",
  food: "#d8a05a",
  culture: "#d87fa8",
};

// labelled ids: Samtal categories, place themes, topic themes
const lbl = (prefix: string, id: string) => {
  const k = `${prefix}_${id}`;
  const e = S[k as keyof typeof S];
  return e ? { is: e.is, en: e.en } : { is: id, en: id };
};
const lblP = (prefix: string, id: string) => {
  const e = lbl(prefix, id);
  return `<span class="bi-is">${esc(e.is)}</span><span class="bi-en">${esc(e.en)}</span>`;
};

export function reportHtml(
  j: Judgments,
  g: Glosses,
  lyrics: Stage4Out,
  exclusions: any[],
  overrides: any[],
  cal: Calibration,
  tl: Timeline,
  bakeoff: any,
  manifestInfo: { snapshot: Record<string, string>; digests: Record<string, string> },
): string {
  const glossByIs = new Map(g.entries.map((e) => [`${e.kind} ${e.is}`, e]));
  const gOf = (kind: string, is: string) => glossByIs.get(`${kind} ${is}`);

  const d = (lang: "is" | "en") => (k: string) => bi(k)[lang];
  const dis = d("is");
  const den = d("en");

  const biPair = (k: string) =>
    `<span class="bi-is">${esc(bi(k).is)}</span><span class="bi-en">${esc(bi(k).en)}</span>`;

  // ---- key numbers ----
  const stats = JSON.parse(
    readFileSync("data/snapshot-20261004/stats.json", "utf8"),
  ).data as { metric: string; value: number }[];
  const stat = (m: string) => stats.find((s) => s.metric === m)?.value ?? 0;
  const numRows: [string, number][] = [
    ["num_participants", stat("participants")],
    ["num_circles", stat("circlesWithMembers")],
    ["num_islenskast", j.isl.length],
    ["num_places", stat("places")],
    ["num_topics", stat("topicWords")],
  ];

  // ---- calibration ----
  const CATS = ["matur", "nattura", "samfelag", "sidir", "hugarfar", "tunga", "vedur", "annad"];

  // ---- places map ----
  const path = icelandPath();
  const { minX, minY, S } = mapTransform();
  const themes = [...new Set(j.places.map((p) => ((p.clef.theme as any)?.choice ?? "unclear")))].sort();
  const hiddenSetEarly = new Set(
    exclusions
      .filter(
        (e: any) =>
          e.kind === "place" &&
          (e.report_label === "outside_iceland" ||
            e.reasons.some(
              (r: string) => r.includes("privacy") || r.includes("digit"),
            )),
      )
      .map((e) => e.source.slice(6)),
  );
  const placeDots = j.places
    .filter((p) => !(p.hasDigit || hiddenSetEarly.has(p.id)))
    .map((p) => {
      const COS = Math.cos((65 * Math.PI) / 180);
      const x = (p.lng * COS - minX) * S;
      const y = (-p.lat - minY) * S;
      const th = (p.clef.theme as any)?.choice ?? "unclear";
      return { x, y, th, id: p.id };
    });

  // texts that must never appear in site/: privacy-excluded, street-address,
  // outside-Iceland items. Their glosses are hidden too — a translation of
  // private text leaks the same information.
  const hiddenIs = new Set<string>(
    exclusions
      .filter(
        (e: any) =>
          e.report_label === "outside_iceland" ||
          e.reasons.some(
            (r: string) => r.includes("privacy") || r.includes("digit"),
          ),
      )
      .map((e: any) => e.text),
  );
  const hiddenSpan = `<em class="small"><span class="bi-is">${esc(bi("hidden_label").is)}</span><span class="bi-en">${esc(bi("hidden_label").en)}</span></em>`;

  // places list (verbatim reason + gloss + theme) — hides privacy/digit/
  // outside-Iceland places entirely; too_long places stay visible
  const excludedIds = hiddenSetEarly;
  const outsideCount = exclusions.filter(
    (e) => e.report_label === "outside_iceland",
  ).length;
  const placeCards = j.places
    .filter((p) => !excludedIds.has(p.id))
    .map((p) => {
      const ge = gOf("reason", p.reason);
      const th = (p.clef.theme as any)?.choice ?? "unclear";
      const glossBadge = ge?.edited
        ? `<span class="badge edit">${esc(bi("gloss_edited").is)} / ${esc(bi("gloss_edited").en)}</span>`
        : `<span class="badge">${esc(bi("gloss_label").is)}</span>`;
      return `<div class="place" data-theme="${th}">
<div class="pname">${esc(p.hasDigit ? p.placeDisplay : p.place)} <a class="src" href="https://talasaman.is/stadir?stadur=${p.id}" target="_blank" rel="noopener">↗</a></div>
<div class="reason">${esc(p.reason)}</div>
<div class="gloss">${escE(ge?.en ?? "")} ${glossBadge}</div>
<div class="meta"><span class="dotlg" style="background:${THEME_COLORS[th] ?? "#666"}"></span>${lblP("theme", th)}</div>
</div>`;
    })
    .join("\n");

  // ---- topics grouped by clef theme ----
  const topicGroups = new Map<string, typeof j.topics>();
  for (const t of j.topics) {
    const th = ((t.clef.topic_theme as any)?.choice ?? "unclear") as string;
    if (!topicGroups.has(th)) topicGroups.set(th, []);
    topicGroups.get(th)!.push(t);
  }
  const topicHtml = [...topicGroups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([th, arr]) => `<div class="tgroup"><h4>${lblP("ttheme", th)}</h4><p>${arr
        .sort((a, b) => b.count - a.count)
        .map((t) => `${esc(t.word)} <span class="badge">×${t.count}</span>`)
        .join(" · ")}</p></div>`,
    )
    .join("\n");

  // ---- disagreements ----
  const missRows = cal.miss_list
    .map((m) => {
      const ge = gOf("answer", m.answer);
      const cell = hiddenIs.has(m.answer)
        ? hiddenSpan
        : `${esc(m.answer)}<br><span class="small">${escE(ge?.en ?? "")}</span>`;
      return `<tr><td>${cell}</td><td>${m.truth.map((t: string) => lblP("cat", t)).join(" + ")}</td><td>${lblP("cat", m.pred)}</td><td class="mono">${m.confidence.toFixed(2)}</td></tr>`;
    })
    .join("\n");

  // ---- overrides ----
  const ovrRows = overrides
    .map(
      (o) =>
        `<tr><td>${o.movement ?? ""}</td><td>${esc(o.action)}</td><td>${esc(o.target.length > 90 ? o.target.slice(0, 90) + "…" : o.target)}</td><td><span class="bi-is">${esc(o.reason_is)}</span><span class="bi-en">${esc(o.reason_en)}</span></td></tr>`,
    )
    .join("\n");

  // ---- sung-line table (songbook parity) ----
  const sungRows = lyrics.movements
    .map((m) =>
      m.lines
        .map((l) => {
          const cnt = (l.count ?? 0) >= 2 ? ` ×${l.count}` : "";
          const ed = l.editorial ? ` <span class="badge edit">${esc(bi("insp_editorial").is)}</span>` : "";
          return `<tr><td>${m.n}</td><td>${esc(l.text)}${cnt}${ed}<br><span class="small">${escE(l.gloss?.en ?? "")}</span></td><td class="small">${esc(l.source)}</td></tr>`;
        })
        .join("\n"),
    )
    .join("\n");

  // ---- bake-off ----
  const bakeAllRows = (bakeoff.items as any[])
    .map((i) => {
      if (hiddenIs.has(i.is))
        return `<tr><td>${hiddenSpan}</td><td>${hiddenSpan}</td><td>${hiddenSpan}</td><td></td></tr>`;
      return `<tr><td>${esc(i.is)}</td>${TRANSLATORS.map((t) => `<td>${escE(i.cands?.[t.id]?.en ?? "")}<br><span class="small mono">${(i.cands?.[t.id]?.faithful ?? 0).toFixed(2)}</span></td>`).join("")}<td>${esc(i.chosen)}${i.edited ? " ✎" : ""}</td></tr>`;
    })
    .join("\n");

  // ---- exclusions summary (text hidden per privacy rule) ----
  const excl = exclusions;
  const excSummary = [
    ["clef privacy ≥ 0.30", excl.filter((e) => e.reasons.some((r: string) => r.includes("privacy"))).length],
    ["too_long (setning > 140 stafa)", excl.filter((e) => e.reasons.some((r: string) => r.includes("too_long"))).length],
    [`${dis("outside_iceland")} / ${den("outside_iceland")}`, outsideCount],
    ["samtal category = annad", excl.filter((e) => e.reasons.some((r: string) => r.includes("annad"))).length],
    ["street address (sveitarfélag only)", excl.filter((e) => e.reasons.some((r: string) => r.includes("digit"))).length],
  ];

  // ---- matsspjald ----
  const rows = ["judgments", "glosses", "music"];
  const rowLabel = (r: string) => bi(`row_${r}`);
  // matsspjald answer per cell (C4: glosses Q2 = að hluta)
  const ANSWERS: Record<string, [string, string, string]> = {
    judgments: ["a_yes", "a_yes", "a_yes"],
    glosses: ["a_yes", "a_partly", "a_yes"],
    music: ["a_partly", "a_partly", "a_yes"],
  };
  const scoreGrid = rows
    .map(
      (r) =>
        `<tr><th>${biPair(`row_${r}`)}</th>${[1, 2, 3]
          .map((q) => `<td><span class="badge" style="margin-right:6px">${biPair(ANSWERS[r][q - 1])}</span><br>${biPair(`q${q}_${r}`)}</td>`)
          .join("")}</tr>`,
    )
    .join("\n");

  const hashRows = Object.entries(manifestInfo.snapshot)
    .map(([f, s]) => `<tr><td>${esc(f)}</td><td class="mono small">${s.slice(0, 16)}…</td></tr>`)
    .join("\n");
  const digestRows = Object.entries(manifestInfo.digests)
    .map(([m, dg]) => `<tr><td>${esc(m)}</td><td class="mono small">${esc(dg)}</td></tr>`)
    .join("\n");

  const fidelityRows = tl.takes
    .map(
      (t) =>
        `<tr><td>seed ${t.seed}</td><td class="mono">${t.score.toFixed(3)}</td><td class="mono">${t.min_fidelity.toFixed(3)}</td><td>${t.seed === tl.chosen_seed ? "✓" : ""}</td></tr>`,
    )
    .join("\n");

  const body = `
${chrome("is", "report")}
<main>
<h1 style="font-family:Fraunces,serif;font-weight:600;font-size:38px;margin:34px 0 6px">${biPair("report_title")}</h1>
<p class="lead">${biPair("tagline")} ${biPair("privacy_note")}</p>

<h2 class="sec">${biPair("sec_numbers")}</h2>
<table class="data">${numRows
    .map(([k, v]) => `<tr><td class="mono" style="font-size:18px">${v}</td><td>${biPair(k)}</td></tr>`)
    .join("")}
<tr><td class="mono" style="font-size:18px">${lyrics.movements.reduce((s, m) => s + m.lines.length, 0)}</td><td>${biPair("num_sung")}</td></tr>
<tr><td class="mono" style="font-size:18px">${(tl.total_duration_s / 60).toFixed(1)} min</td><td>${biPair("num_duration")}</td></tr>
</table>

<h2 class="sec">${biPair("sec_calibration")}</h2>
<p class="lead">${biPair("calibration_intro")}</p>
<p>Hit rate: <b>${(cal.hit_rate * 100).toFixed(1)}%</b> (${cal.hits}/${cal.unit}) · Cohen's κ (n=${cal.single_category.n}): <b>${cal.single_category.kappa.toFixed(3)}</b> · <span class="small">mean Clef confidence: hits ${cal.confidence.mean_on_hits?.toFixed(3)} vs misses ${cal.confidence.mean_on_misses?.toFixed(3)}</span></p>
<table class="data"><tr><th>truth \\ pred</th>${CATS.map((c) => `<th>${c}</th>`).join("")}</tr>
${CATS.map(
  (t) =>
    `<tr><th>${t}</th>${CATS.map((p) => `<td class="mono">${cal.single_category.confusion[t][p] || ""}</td>`).join("")}</tr>`,
).join("\n")}</table>

<h2 class="sec">${biPair("sec_disagree")}</h2>
<p class="lead">${biPair("disagree_intro")}</p>
<table class="data"><tr><th>${biPair("col_answer")}</th><th>${biPair("col_truth")}</th><th>Clef</th><th>conf.</th></tr>${missRows}</table>

<h2 class="sec">${biPair("sec_places")}</h2>
<div class="mapwrap">
<svg viewBox="0 0 1000 760" class="map"><path d="${path}" fill="rgba(70,120,110,.12)" stroke="#6fd9c0" stroke-width="1.4"/>
${placeDots.map((p) => `<circle class="pd" data-theme="${p.th}" cx="${p.x}" cy="${p.y}" r="4" fill="${THEME_COLORS[p.th] ?? "#888"}" data-id="${p.id}"/>`).join("\n")}
</svg>
<div class="filters" id="themeFilters">${themes
    .map(
      (t) =>
        `<button class="fbtn" data-th="${t}" style="border-color:${THEME_COLORS[t] ?? "#666"}"><span class="dotlg" style="background:${THEME_COLORS[t] ?? "#666"}"></span>${lblP("theme", t)}</button>`,
    )
    .join("")}<button class="fbtn all" data-th="*">${biPair("all_themes")}</button></div>
</div>
<p class="small"><span class="bi-is">${outsideCount} ${esc(bi("outside_note").is)}</span><span class="bi-en">${outsideCount} ${esc(bi("outside_note").en)}</span> ${biPair("privacy_note")}</p>
<div class="places" id="placeList">${placeCards}</div>

<h2 class="sec">${biPair("sec_topics")}</h2>
${topicHtml}

<h2 class="sec">${biPair("sec_bakeoff")}</h2>
<p class="lead">${biPair("bakeoff_body")}</p>
<p class="small">${esc(bakeoff.spot_check)}</p>
<table class="data"><tr><th>model</th><th>mean faithful</th><th>${biPair("col_chosen")}</th><th>&lt; 0.60</th><th>median latency</th></tr>
${TRANSLATORS.map((t) => { const st = bakeoff[t.id]; return `<tr><td>${esc(t.name)}</td><td class="mono">${st.mean_faithful.toFixed(3)}</td><td class="mono">${st.wins}</td><td class="mono">${st.under_060}</td><td class="mono">${(st.median_latency_ms / 1000).toFixed(2)} s</td></tr>`; }).join("\n")}</table>
<details><summary class="small" style="cursor:pointer">${biPair("bakeoff_all")}</summary>
<table class="data"><tr><th>${biPair("col_islang")}</th>${TRANSLATORS.map((t) => `<th>${esc(t.name)}</th>`).join("")}<th>${biPair("col_chosen")}</th></tr>${bakeAllRows}</table></details>

<h2 class="sec">${biPair("sec_editorial")}</h2>
<p class="lead">${biPair("editorial_body")}</p>
<table class="data"><tr><th>${biPair("col_mov")}</th><th>action</th><th>${biPair("col_item")}</th><th>${biPair("col_reason")}</th></tr>${ovrRows}</table>
<table class="data"><tr><th>${biPair("excl_title")}</th><th>n</th></tr>
${excSummary.map(([k, v]) => `<tr><td>${esc(String(k))}</td><td class="mono">${v}</td></tr>`).join("\n")}</table>

<h2 class="sec">${biPair("sec_sung")}</h2>
<table class="data"><tr><th>#</th><th>${biPair("col_line_gloss")}</th><th>${biPair("col_source")}</th></tr>${sungRows}</table>

<h2 class="sec">${biPair("sec_after")}</h2>
<p class="lead">${biPair("after_body")}</p>

<h2 class="sec">${biPair("sec_scorecard")}</h2>
<p class="lead">${biPair("scorecard_credit")}</p>
<table class="data"><tr><th></th><th>${biPair("q1")}</th><th>${biPair("q2")}</th><th>${biPair("q3")}</th></tr>${scoreGrid}</table>
<p class="lead">${biPair("axes")}</p>

<h2 class="sec">${biPair("sec_replay")}</h2>
<p class="lead">${biPair("replay_body")}</p>
<p class="small">${biPair("proof_of_place")}</p>
<pre class="replay">vp run judge   # stages 1-3 (Clef + Granite + Gemma)
vp run arrange # stage 4 -> out/lyrics.json
vp run music   # stages 5-6 (ElevenLabs takes + Scribe align)
vp run site    # stage 7 -> site/
vp run build   # full replay from cache, offline
vp run rerun -- --model clef   # re-call + diff</pre>
<h4>${biPair("sec_snapshot")}</h4>
<table class="data">${hashRows}</table>
<h4>${biPair("sec_digests")}</h4>
<table class="data">${digestRows}</table>
<h4>${biPair("sec_takes")}</h4>
<table class="data"><tr><th>take</th><th>score</th><th>min line</th><th>${biPair("col_chosen")}</th></tr>${fidelityRows}</table>
<p class="small">logs: runs/&lt;run-id&gt;/{clef,granite,gemma,apertus,elevenlabs}.jsonl · cache/&lt;model&gt;/&lt;sha&gt;.json · media/takes/</p>
</main>
${footer("is")}
<style>
.mapwrap{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}
.map{flex:1;min-width:300px;max-width:560px;background:#0a1322;border:1px solid var(--line);border-radius:10px}
.filters{display:flex;flex-direction:column;gap:6px}
.fbtn{cursor:pointer;background:none;color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:4px 10px;font:inherit;font-size:12.5px;display:flex;gap:8px;align-items:center}
.fbtn.off{opacity:.3}
.dotlg{display:inline-block;width:10px;height:10px;border-radius:50%}
.pd{cursor:pointer;transition:r .15s}
.pd:hover{r:7}
.pd.off{opacity:.12}
.places{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;margin-top:14px}
.place{border:1px solid var(--line);border-radius:10px;padding:12px 14px;background:#0d1730}
.place .pname{font-weight:600;font-size:14px}
.place .reason{font-family:Fraunces,serif;font-size:15px;margin:6px 0;color:#e8e2d4}
.place .gloss{font-size:12.5px;color:var(--dim)}
.place .meta{font-size:12px;color:var(--dim);margin-top:6px;display:flex;gap:6px;align-items:center}
.place.hidden{display:none}
.tgroup h4{color:var(--accent);font-size:14px;margin:14px 0 4px;text-transform:capitalize}
pre.replay{background:#0d1730;border:1px solid var(--line);border-radius:8px;padding:14px;font-size:12.5px;overflow-x:auto}
.src{color:var(--dim);text-decoration:none;font-size:11px}
</style>
<script>
document.querySelectorAll('.fbtn').forEach(b=>b.onclick=()=>{
  const th=b.dataset.th;
  document.querySelectorAll('.fbtn').forEach(x=>x.classList.toggle('off',th!=='*'&&x.dataset.th!==th&&x.dataset.th!=='*'));
  document.querySelectorAll('.pd').forEach(p=>p.classList.toggle('off',th!=='*'&&p.dataset.theme!==th));
  document.querySelectorAll('.place').forEach(p=>p.classList.toggle('hidden',th!=='*'&&p.dataset.theme!==th));
});
</script>
`;
  return htmlShell({
    title: bi("report_title").is,
    titleOther: bi("report_title").en,
    body,
  });
}
