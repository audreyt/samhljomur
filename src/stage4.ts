// Stage 4: arrangement -> out/lyrics.json, out/lyrics.txt, out/exclusions.json

import { readFileSync, writeFileSync } from "node:fs";
import { ClefAnswers } from "./model";
import {
  ATTRIBUTION,
  BRIDGE_STYLES,
  BRIDGE_TITLE,
  CATEGORIES,
  COUNT_FLOOR,
  DISCLAIMER_EN,
  DISCLAIMER_IS,
  ICELAND_BBOX,
  MOVEMENT_STYLES,
  MOVEMENTS,
  NEGATIVE_STYLES,
  PRIVACY_THRESHOLD,
  SECONDS_SCALE,
  SKUGGI_CONCEPT,
  sungText,
  TAGLINE,
  TITLE_CLOSERS,
} from "./spec";
import { IslJudgment, Judgments, PlaceJudgment, TopicJudgment } from "./stage1";
import { Glosses, glossMap, GlossEntry } from "./stage2";

// ---------- helpers ----------

const COS65 = Math.cos((65 * Math.PI) / 180);

function noul(a: unknown): number {
  return (a as { noul?: number })?.noul ?? 0;
}
function score(a: unknown): number {
  return (a as { score?: number })?.score ?? 0;
}
function choice(a: unknown): string {
  return (a as { choice?: string })?.choice ?? "unclear";
}
function confidence(a: unknown): number {
  return (a as { confidence?: number })?.confidence ?? 0;
}
function probabilities(a: unknown): Record<string, number> {
  return (a as { probabilities?: Record<string, number> })?.probabilities ?? {};
}

export function expectedSeconds(clef: ClefAnswers): number {
  const p = probabilities(clef.seconds);
  let s = 0;
  SECONDS_SCALE.forEach((v, i) => {
    s += (p[String(i)] ?? 0) * v;
  });
  return s;
}

export function compositeOf(clef: ClefAnswers): number {
  let c = (score(clef.singable) + score(clef.image) + score(clef.warmth)) / 12;
  if (noul(clef.spelling) >= 0.5) c -= 0.15;
  return c;
}

interface LyricPart {
  text: string;
  source: string;
  url?: string;
  composite: number | null;
  seconds: number | null;
  tone: string | null;
  gloss_en: string;
  gloss_faithful: number;
  gloss_zh?: string;
  gloss_zh_edited?: boolean;
  clef?: ClefAnswers;
}

interface LyricLine {
  n: number;
  kind: "line" | "refrain" | "topics" | "tagline";
  text: string;
  sung: string; // A5 normalized text sent to the music API
  source: string;
  url?: string;
  concepts?: string[];
  categories?: string[];
  count?: number;
  lat?: number;
  lng?: number;
  theme?: string;
  tone?: string | null;
  seconds?: number | null;
  composite?: number | null;
  clef?: ClefAnswers;
  gloss?: {
    en: string;
    faithful: number;
    edited?: boolean;
    zh?: string;
    zh_edited?: boolean;
  };
  parts?: LyricPart[];
  label?: string;
  editorial?: { kind: string; reason_is: string; reason_en: string };
}

interface Chunk {
  n: number;
  title_is: string;
  title_en: string;
  section: "main" | "bridge";
  line_indices: number[];
  text: string;
  duration_ms: number;
  positive_styles: string[];
  negative_styles: string[];
  context_adherence: string;
}

interface Movement {
  n: number;
  title_is: string;
  title_en: string;
  lines: LyricLine[];
  chunks: Chunk[];
}

interface Exclusion {
  kind: "islenskast" | "place";
  source: string;
  text: string;
  display_text?: string;
  reasons: string[];
  privacy?: number;
  report_label?: string; // A1: counted in report, text not shown
}

export interface OverrideEntry {
  movement?: number;
  action:
    | "include_popularity"
    | "title_closer"
    | "exclude"
    | "gloss_edit";
  target: string;
  reason_is: string;
  reason_en: string;
  count?: number;
  via_clef?: boolean;
}

// ---------- eligibility ----------

function islEligible(it: IslJudgment, excl: Exclusion[]): boolean {
  const reasons: string[] = [];
  const priv = noul(it.clef.privacy);
  if (priv >= PRIVACY_THRESHOLD)
    reasons.push(`clef privacy ${priv.toFixed(3)} >= ${PRIVACY_THRESHOLD}`);
  if (!it.categories.some((c) => c !== "annad"))
    reasons.push("samtal category is annad only");
  if (reasons.length) {
    excl.push({
      kind: "islenskast",
      source: `islenskast:${it.concepts.join(",")}`,
      text: it.answer,
      reasons,
      privacy: priv,
    });
    return false;
  }
  return true;
}

function outsideIceland(p: PlaceJudgment): boolean {
  return (
    p.lat < ICELAND_BBOX.latMin ||
    p.lat > ICELAND_BBOX.latMax ||
    p.lng < ICELAND_BBOX.lngMin ||
    p.lng > ICELAND_BBOX.lngMax
  );
}

function placeEligible(p: PlaceJudgment, excl: Exclusion[]): boolean {
  const reasons: string[] = [];
  const priv = noul(p.clef.privacy);
  if (priv >= PRIVACY_THRESHOLD)
    reasons.push(`clef privacy ${priv.toFixed(3)} >= ${PRIVACY_THRESHOLD}`);
  if (p.tooLong) reasons.push("a single sentence > 140 chars: too_long");
  if (p.hasDigit)
    reasons.push(
      `place contains a digit (street address): shown as "${p.placeDisplay}", never sung`,
    );
  if (outsideIceland(p))
    reasons.push(
      `outside Iceland bbox (lat ${p.lat}, lng ${p.lng}): utan Íslands`,
    );
  if (p.needsExcerpt && !p.excerpt)
    reasons.push("excerpt question did not return a sentence");
  if (reasons.length) {
    excl.push({
      kind: "place",
      source: `place:${p.id}`,
      text: p.reason,
      display_text: p.hasDigit ? p.placeDisplay : p.place,
      reasons,
      privacy: priv,
      report_label: outsideIceland(p) ? "outside_iceland" : undefined,
    });
    return false;
  }
  return true;
}

// ---------- ordering ----------

interface Scored {
  rowIndex: number;
  composite: number;
  tone: string;
  opener: number;
  closer: number;
}

function byComposite<T extends Scored>(a: T, b: T): number {
  return b.composite - a.composite || a.rowIndex - b.rowIndex;
}

function argmaxBy<T extends Scored>(
  pool: T[],
  key: "opener" | "closer",
): T {
  return [...pool].sort(
    (a, b) => b[key] - a[key] || byComposite(a, b),
  )[0];
}

// Round-robin middle lines by tone so equal tones are not adjacent where
// avoidable; greedy "largest remaining group != previous tone".
function reorderByTone<T extends Scored>(
  middles: T[],
  firstTone: string | null,
  lastTone: string | null,
): T[] {
  const groups = new Map<string, T[]>();
  for (const m of middles) {
    const g = groups.get(m.tone);
    if (g) g.push(m);
    else groups.set(m.tone, [m]);
  }
  const out: T[] = [];
  let prev = firstTone;
  while (true) {
    const live = [...groups.values()].filter((g) => g.length);
    if (!live.length) break;
    const diff = live.filter((g) => g[0].tone !== prev);
    const pick = (diff.length ? diff : live).sort(
      (a, b) => b.length - a.length || byComposite(a[0], b[0]),
    )[0];
    const item = pick.shift()!;
    out.push(item);
    prev = item.tone;
  }
  // keep the closer's adjacency clean if a swap can fix it
  if (lastTone && out.length && out[out.length - 1].tone === lastTone) {
    for (let i = 0; i < out.length - 1; i++) {
      const cand = out[i];
      if (cand.tone === lastTone) continue;
      const beforeOK = i === 0 || out[i - 1].tone !== out[out.length - 1].tone;
      const afterOK = out[i + 1].tone !== out[out.length - 1].tone;
      if (beforeOK && afterOK && cand.tone !== out[out.length - 2]?.tone) {
        const tmp = out[out.length - 1];
        out[out.length - 1] = cand;
        out[i] = tmp;
        break;
      }
    }
  }
  return out;
}

// first = argmax opener, last = argmax closer (distinct), middle composite
// desc reordered round-robin by tone. A3: a title line, when present, is the
// closer and overrides argmax-closer.
function arrangeLines<T extends Scored>(
  pool: T[],
  closerItem?: T,
): T[] {
  if (pool.length <= 1) return [...pool];
  const closer = closerItem ?? argmaxBy(pool, "closer");
  const first = argmaxBy(
    pool.filter((l) => l !== closer),
    "opener",
  );
  const middles = pool
    .filter((l) => l !== first && l !== closer)
    .sort(byComposite);
  return [
    first,
    ...reorderByTone(middles, first.tone, closer.tone),
    closer,
  ];
}

// ---------- stage 4 ----------

export interface Stage4Out {
  movements: Movement[];
  exclusions: Exclusion[];
  overrides: OverrideEntry[];
  total_duration_ms: number;
}

export function stage4(j: Judgments, g: Glosses): Stage4Out {
  const gm = glossMap(g);
  const gOf = (kind: GlossEntry["kind"], is: string): GlossEntry | undefined =>
    gm.get(`${kind} ${is}`);
  const gRec = (e: GlossEntry | undefined) => ({
    en: e?.en ?? "",
    faithful: e?.faithful ?? 0,
    edited: e?.edited,
    zh: e?.zh ?? "",
    zh_edited: e?.zh_edited,
  });
  const overrides: OverrideEntry[] = [];
  const ovr = (e: OverrideEntry) => overrides.push(e);

  const exclusions: Exclusion[] = [];
  const used = new Set<string>();

  // editorial reason strings come from copy/strings.json (lead-authored)
  const STR = JSON.parse(
    readFileSync("copy/strings.json", "utf8"),
  ) as Record<string, { is: string; en: string }>;

  // eligibility computed once per item so each exclusion is logged exactly once
  const islOK = new Map<IslJudgment, boolean>();
  for (const it of j.isl) islOK.set(it, islEligible(it, exclusions));
  const placeOK = new Map<PlaceJudgment, boolean>();
  for (const p of j.places) placeOK.set(p, placeEligible(p, exclusions));

  // wrap a judged item into a scored lyric-line record
  const islLine = (it: IslJudgment): LyricLine & Scored => ({
    n: 0,
    kind: "line",
    text: it.answer,
    sung: sungText(it.answer),
    source: `islenskast:${it.concepts.join(",")}`,
    concepts: it.concepts,
    categories: it.categories,
    count: Math.max(...it.counts),
    tone: choice(it.clef.tone),
    seconds: expectedSeconds(it.clef),
    composite: compositeOf(it.clef),
    clef: it.clef,
    gloss: gRec(gOf("answer", it.answer)),
    rowIndex: it.rowIndex,
    opener: score(it.clef.opener),
    closer: score(it.clef.closer),
  });
  const placeLine = (p: PlaceJudgment): LyricLine & Scored => ({
    n: 0,
    kind: "line",
    text: `${p.placeDisplay}. ${p.excerpt ? p.excerpt.sentence : p.reason}`,
    sung: sungText(
      `${p.placeDisplay}. ${p.excerpt ? p.excerpt.sentence : p.reason}`,
    ),
    source: `place:${p.id}`,
    url: `https://talasaman.is/stadir?stadur=${p.id}`,
    lat: p.lat,
    lng: p.lng,
    theme: choice(p.clef.theme),
    tone: choice(p.clef.tone),
    seconds: expectedSeconds(p.clef),
    composite: compositeOf(p.clef),
    clef: p.clef,
    gloss: gRec(
      p.excerpt ? gOf("excerpt", p.excerpt.sentence) : gOf("reason", p.reason),
    ),
    rowIndex: p.rowIndex,
    opener: score(p.clef.opener),
    closer: score(p.clef.closer),
  });

  const islPool = (cats: string[]) =>
    j.isl.filter(
      (it) =>
        it.categories.some((c) => cats.includes(c)) &&
        islOK.get(it) &&
        !used.has(it.answer),
    );

  const movements: Movement[] = [];
  const M = (n: number) => MOVEMENTS[n - 1];

  // A2 popularity floor + A3 title closer + cap fill.
  // forced = count >= 3 or the movement's title answer; they are included
  // before the cap is filled by composite (cap grows if needed).
  type IslLine = LyricLine & Scored;
  const selectIsl = (cats: string[], cap: number, mvn: number): IslLine[] => {
    const pool = islPool(cats).map(islLine);
    const titleTxt = TITLE_CLOSERS[mvn];
    const forced: IslLine[] = [];
    for (const l of pool) {
      if ((l.count ?? 0) >= COUNT_FLOOR) {
        forced.push(l);
        l.editorial = {
          kind: "popularity",
          reason_is: STR.override_count.is,
          reason_en: STR.override_count.en,
        };
        ovr({
          movement: mvn,
          action: "include_popularity",
          target: l.text,
          count: l.count,
          reason_is: l.editorial.reason_is,
          reason_en: l.editorial.reason_en,
        });
      } else if (l.text === titleTxt) {
        forced.push(l);
      }
    }
    const title = pool.find((l) => l.text === titleTxt);
    if (title && !forced.includes(title)) forced.push(title);
    const rest = pool
      .filter((l) => !forced.includes(l))
      .sort(byComposite)
      .slice(0, Math.max(0, cap - forced.length));
    const selected = [...forced.sort(byComposite), ...rest];
    if (title) {
      title.editorial = {
        kind: "title",
        reason_is: STR.override_title.is,
        reason_en: STR.override_title.en,
      };
      ovr({
        movement: mvn,
        action: "title_closer",
        target: title.text,
        reason_is: title.editorial.reason_is,
        reason_en: title.editorial.reason_en,
      });
    }
    return selected;
  };

  // ---- M1 Gluggaveður: vedur, all eligible, max 8 ----
  {
    const pool = selectIsl(["vedur"], 8, 1);
    const lines = arrangeLines(pool, pool.find((l) => l.text === TITLE_CLOSERS[1]));
    lines.forEach((l) => used.add(l.text));
    movements.push(mv(M(1).n, lines));
  }

  // ---- M2 Ís í fárviðri: matur, top 12 ----
  {
    const pool = selectIsl(["matur"], 12, 2);
    const lines = arrangeLines(pool, pool.find((l) => l.text === TITLE_CLOSERS[2]));
    lines.forEach((l) => used.add(l.text));
    movements.push(mv(M(2).n, lines));
  }

  // ---- M3 Hringvegurinn: places by sector, max 16 + nattura refrain ----
  {
    const THETA_RKV = (() => {
      const dy = 64.14 - 64.95;
      const dx = (-21.9 + 18.6) * COS65;
      return (Math.atan2(dy, dx) * 180) / Math.PI;
    })();
    const eligible = j.places.filter((p) => placeOK.get(p));
    const sectors = new Map<number, (PlaceJudgment & { _c: number })[]>();
    for (const p of eligible) {
      const c = compositeOf(p.clef);
      const th =
        (Math.atan2(p.lat - 64.95, (p.lng + 18.6) * COS65) * 180) / Math.PI;
      const sec = Math.floor(th / 45);
      const arr = sectors.get(sec) ?? [];
      arr.push({ ...p, _c: c });
      sectors.set(sec, arr);
    }
    let picked: (PlaceJudgment & { _c: number; _th: number })[] = [];
    for (const [, arr] of sectors) {
      arr.sort((a, b) => b._c - a._c || a.rowIndex - b.rowIndex);
      for (const p of arr.slice(0, 2)) {
        picked.push({
          ...p,
          _th:
            (Math.atan2(p.lat - 64.95, (p.lng + 18.6) * COS65) * 180) / Math.PI,
        });
      }
    }
    if (picked.length > 16) {
      picked = picked.sort((a, b) => b._c - a._c || a.rowIndex - b.rowIndex).slice(0, 16);
    }
    // clockwise from Reykjavík: decreasing theta, wrapped at THETA_RKV
    picked.sort((a, b) => {
      const ra = (((a._th - THETA_RKV) % 360) + 360) % 360;
      const rb = (((b._th - THETA_RKV) % 360) + 360) % 360;
      return rb - ra || b._c - a._c || a.rowIndex - b.rowIndex;
    });
    const sung = picked.map((p) => placeLine(p));
    sung.forEach((l) => used.add(l.text));

    // refrain: top 4 eligible nattura answers -> one 2-line refrain
    const refr = islPool(["nattura"])
      .map(islLine)
      .sort(byComposite)
      .slice(0, 4);
    const partOf = (l: LyricLine & Scored): LyricPart => ({
      text: l.text,
      source: l.source,
      composite: l.composite,
      seconds: l.seconds ?? null,
      tone: l.tone ?? null,
      gloss_en: l.gloss!.en,
      gloss_faithful: l.gloss!.faithful,
      gloss_zh: l.gloss!.zh ?? "",
      gloss_zh_edited: l.gloss!.zh_edited,
      clef: l.clef,
    });
    const refrainLines: LyricLine[] = [];
    for (let k = 0; k < refr.length; k += 2) {
      const a = refr[k];
      const b = refr[k + 1];
      refrainLines.push({
        n: 0,
        kind: "refrain",
        text: b ? `${a.text}, ${b.text}` : a.text,
        sung: sungText(b ? `${a.text}, ${b.text}` : a.text),
        source: b ? `${a.source}; ${b.source}` : a.source,
        seconds: (a.seconds ?? 0) + (b?.seconds ?? 0),
        composite: null,
        tone: null,
        gloss: {
          en: b ? `${a.gloss!.en}; ${b.gloss!.en}` : a.gloss!.en,
          faithful: Math.min(a.gloss!.faithful, b?.gloss!.faithful ?? 1),
          zh: b ? `${a.gloss!.zh ?? ""}; ${b.gloss!.zh ?? ""}` : (a.gloss!.zh ?? ""),
        },
        parts: b ? [partOf(a), partOf(b)] : [partOf(a)],
      });
      used.add(a.text);
      if (b) used.add(b.text);
    }
    const lines: LyricLine[] = [
      ...sung.slice(0, 4),
      ...refrainLines,
      ...sung.slice(4, 12),
      // second refrain occurrence needs distinct objects for line numbering
      ...refrainLines.map((l) => ({ ...l })),
      ...sung.slice(12),
    ];
    movements.push(mv(M(3).n, lines));
  }

  // ---- M4 Lopinn og laugin: sidir+samfelag minus skuggi, top 10; bridge ----
  {
    // main pool excludes the skuggi concept; A2 floor applies, no title line
    const saved = islPool(["sidir", "samfelag"]);
    const poolF = saved.filter((it) => !it.concepts.includes(SKUGGI_CONCEPT));
    // reuse selectIsl logic on a filtered pool
    const poolAll = poolF.map(islLine);
    const forced = poolAll.filter((l) => (l.count ?? 0) >= COUNT_FLOOR);
    for (const l of forced) {
      l.editorial = {
        kind: "popularity",
        reason_is: STR.override_count.is,
        reason_en: STR.override_count.en,
      };
      ovr({
        movement: 4,
        action: "include_popularity",
        target: l.text,
        count: l.count,
        reason_is: l.editorial.reason_is,
        reason_en: l.editorial.reason_en,
      });
    }
    const rest = poolAll
      .filter((l) => !forced.includes(l))
      .sort(byComposite)
      .slice(0, Math.max(0, 10 - forced.length));
    const main = arrangeLines([...forced.sort(byComposite), ...rest]);
    main.forEach((l) => used.add(l.text));

    const bridgePool = j.isl
      .filter(
        (it) =>
          it.concepts.includes(SKUGGI_CONCEPT) &&
          islOK.get(it) &&
          !used.has(it.answer),
      )
      .sort((a, b) => a.rowIndex - b.rowIndex)
      .slice(0, 5)
      .map(islLine);
    const bridge = arrangeLines(bridgePool);
    bridge.forEach((l) => used.add(l.text));
    const mov = mv(M(4).n, [...main, ...bridge]);
    mov.bridge_start = main.length;
    movements.push(mov);
  }

  // ---- M5 Þetta reddast: hugarfar+tunga, top 12 ----
  {
    const pool = selectIsl(["hugarfar", "tunga"], 12, 5);
    const lines = arrangeLines(pool, pool.find((l) => l.text === TITLE_CLOSERS[5]));
    lines.forEach((l) => used.add(l.text));
    movements.push(mv(M(5).n, lines));
  }

  // ---- M6: topic words count>=20, 4 per line + tagline ----
  {
    const words = j.topics
      .filter((t) => t.count >= 20)
      .sort((a, b) => b.count - a.count || a.rowIndex - b.rowIndex);
    const lines: LyricLine[] = [];
    for (let i = 0; i < words.length; i += 4) {
      const grp = words.slice(i, i + 4);
      const parts = grp.map((t) => {
        const ge = gOf("topic", t.word);
        return {
          text: t.word,
          source: `topics:${t.word}`,
          composite: null,
          seconds: null,
          tone: null,
          gloss_en: ge?.en ?? "",
          gloss_faithful: ge?.faithful ?? 0,
          gloss_zh: ge?.zh ?? "",
          gloss_zh_edited: ge?.zh_edited,
          clef: t.clef,
        } as LyricPart;
      });
      lines.push({
        n: 0,
        kind: "topics",
        text: grp.map((t) => t.word).join(", "),
        sung: sungText(grp.map((t) => t.word).join(", ")),
        source: `topics:${grp.map((t) => t.word).join(",")}`,
        seconds: null,
        composite: null,
        tone: null,
        gloss: {
          en: parts.map((p) => p.gloss_en).join("; "),
          faithful: Math.min(...parts.map((p) => p.gloss_faithful)),
          zh: parts.map((p) => p.gloss_zh ?? "").join("; "),
        },
        parts,
      });
    }
    const tg = gOf("tagline", TAGLINE);
    lines.push({
      n: 0,
      kind: "tagline",
      text: TAGLINE,
      sung: sungText(TAGLINE),
      source: "samtal:tagline",
      label: "Samtal's own tagline / Einkunnarorð Samtals",
      seconds: null,
      composite: null,
      tone: null,
      gloss: gRec(tg),
    });
    movements.push(mv(M(6).n, lines));
  }

  // number lines and build chunks
  let total = 0;
  for (const m of movements) {
    m.lines.forEach((l, i) => (l.n = i + 1));
    m.chunks = buildChunks(m);
    total += m.chunks.reduce((s, c) => s + c.duration_ms, 0);
  }

  return { movements, exclusions, overrides, total_duration_ms: total };
}

interface MovementX extends Movement {
  bridge_start?: number;
}

function mv(n: number, lines: LyricLine[]): MovementX {
  return {
    n,
    title_is: MOVEMENTS[n - 1].is,
    title_en: MOVEMENTS[n - 1].en,
    lines,
    chunks: [],
  };
}

function lineDurContribution(seconds: number | null | undefined): number {
  if (seconds == null) return 4500;
  return Math.max(4500, 1200 * seconds);
}

function buildChunks(m: MovementX): Chunk[] {
  // consecutive groups of <=10 lines; a bridge always starts a fresh chunk so
  // it keeps its own styles.
  const chunks: Chunk[] = [];
  const bridgeAt = m.bridge_start ?? Infinity;
  let cur: LyricLine[] = [];
  let curSection: "main" | "bridge" = "main";
  const flush = () => {
    if (!cur.length) return;
    const n = chunks.length + 1;
    const secs = cur.reduce((s, l) => s + lineDurContribution(l.seconds), 0);
    const ms =
      Math.round(Math.min(120000, Math.max(20000, 6000 + secs)) / 1000) * 1000;
    const styles = curSection === "bridge" ? BRIDGE_STYLES : MOVEMENT_STYLES[m.n];
    const title =
      curSection === "bridge"
        ? BRIDGE_TITLE
        : { is: m.title_is, en: m.title_en };
    chunks.push({
      n,
      title_is: title.is,
      title_en: title.en,
      section: curSection,
      line_indices: cur.map((l) => l.n),
      text:
        `[${sungText(title.is)}]\n` + cur.map((l) => l.sung).join("\n"),
      duration_ms: ms,
      positive_styles: styles.positive_styles,
      negative_styles: NEGATIVE_STYLES,
      context_adherence: styles.context_adherence,
    });
    cur = [];
  };
  for (const l of m.lines) {
    const sec: "main" | "bridge" = l.n - 1 >= bridgeAt ? "bridge" : "main";
    if (sec !== curSection) flush();
    curSection = sec;
    if (cur.length >= 10) flush();
    cur.push(l);
  }
  flush();
  return chunks;
}

// ---------- writers ----------

export function writeLyrics(out: Stage4Out) {
  const doc = {
    attribution: ATTRIBUTION,
    disclaimer_is: DISCLAIMER_IS,
    disclaimer_en: DISCLAIMER_EN,
    total_duration_ms: out.total_duration_ms,
    movements: out.movements,
    exclusions_count: out.exclusions.length,
  };
  writeFileSync("out/lyrics.json", JSON.stringify(doc, null, 2) + "\n");
  writeFileSync("out/lyrics.txt", lyricsText(doc));
  writeFileSync(
    "out/exclusions.json",
    JSON.stringify(out.exclusions, null, 2) + "\n",
  );
  writeFileSync(
    "out/overrides.json",
    JSON.stringify(out.overrides, null, 2) + "\n",
  );
}

function lyricsText(doc: {
  total_duration_ms: number;
  movements: Movement[];
}): string {
  const L: string[] = [];
  L.push("Samhljómur: lyric sheet (stage 4 arrangement)");
  L.push(ATTRIBUTION);
  L.push(`${DISCLAIMER_IS} / ${DISCLAIMER_EN}`);
  L.push("EN lines are vélþýðing / machine gloss.");
  L.push("");
  const f2 = (x: number | null | undefined) =>
    x == null ? "  -  " : x.toFixed(2).padStart(5);
  for (const m of doc.movements) {
    L.push(`=== ${m.n}. ${m.title_is} / ${m.title_en} ===`);
    m.lines.forEach((l) => {
      const tag =
        l.kind === "refrain"
          ? " [refrain]"
          : l.kind === "tagline"
            ? ` [${l.label ?? "tagline"}]`
            : l.kind === "topics"
              ? " [topics]"
              : "";
      const ed = l.editorial ? ` [ed:${l.editorial.kind}]` : "";
      const gloss = l.gloss?.edited
        ? `${l.gloss.en} [ritstýrt/edited]`
        : l.gloss?.en ?? "";
      const cnt = (l.count ?? 0) >= 2 ? ` ×${l.count}` : "";
      L.push(`  ${String(l.n).padStart(2)}. ${l.text}${tag}${ed}${cnt}`);
      L.push(
        `      comp ${f2(l.composite)} | s ${l.seconds == null ? "-" : l.seconds.toFixed(1)} | tone ${l.tone ?? "-"} | ${l.source} | ${gloss}`,
      );
    });
    for (const c of m.chunks) {
      L.push(
        `  -- chunk ${c.n} [${c.section}] lines ${c.line_indices.join(",")} -> ${c.duration_ms} ms (${(c.duration_ms / 1000).toFixed(0)} s)`,
      );
    }
    L.push("");
  }
  L.push(
    `TOTAL: ${doc.total_duration_ms} ms (${(doc.total_duration_ms / 1000).toFixed(1)} s)`,
  );
  return L.join("\n") + "\n";
}
