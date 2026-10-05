// Stage 3: calibration against Samtal hand coding -> out/calibration.json + .md

import { writeFileSync } from "node:fs";
import { CATEGORIES } from "./spec";
import { Judgments } from "./stage1";

interface Miss {
  answer: string;
  truth: string[];
  pred: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface Calibration {
  unit: number;
  hits: number;
  misses: number;
  hit_rate: number;
  per_category: Record<
    string,
    { truth_count: number; hits: number; hit_rate: number }
  >;
  single_category: {
    n: number;
    kappa: number;
    po: number;
    pe: number;
    confusion: Record<string, Record<string, number>>;
  };
  confidence: {
    mean_on_hits: number | null;
    mean_on_misses: number | null;
    n_hits: number;
    n_misses: number;
  };
  miss_list: Miss[];
}

export function stage3(j: Judgments): Calibration {
  let hits = 0;
  const misses: Miss[] = [];
  const perCatTruth: Record<string, number> = {};
  const perCatHits: Record<string, number> = {};
  const confHits: number[] = [];
  const confMisses: number[] = [];
  const confusion: Record<string, Record<string, number>> = {};
  for (const c of CATEGORIES) {
    perCatTruth[c] = 0;
    perCatHits[c] = 0;
    confusion[c] = {};
    for (const p of CATEGORIES) confusion[c][p] = 0;
  }
  let singleN = 0;
  let singleAgree = 0;

  for (const it of j.isl) {
    const truth = it.categories;
    const cat = it.clef.category as {
      choice: string;
      probabilities: Record<string, number>;
      confidence: number;
    };
    const pred = cat.choice;
    const hit = truth.includes(pred);
    if (hit) {
      hits++;
      confHits.push(cat.confidence);
    } else {
      confMisses.push(cat.confidence);
      misses.push({
        answer: it.answer,
        truth,
        pred,
        confidence: cat.confidence,
        probabilities: cat.probabilities,
      });
    }
    for (const c of truth) {
      perCatTruth[c]++;
      if (hit) perCatHits[c]++;
    }
    if (truth.length === 1) {
      singleN++;
      confusion[truth[0]][pred]++;
      if (pred === truth[0]) singleAgree++;
    }
  }

  // Cohen's kappa on single-category answers, 8 classes.
  const N = singleN;
  const po = N ? singleAgree / N : 0;
  let pe = 0;
  if (N) {
    for (const c of CATEGORIES) {
      let rowSum = 0;
      let colSum = 0;
      for (const p of CATEGORIES) {
        rowSum += confusion[c][p];
        colSum += confusion[p][c];
      }
      pe += (rowSum * colSum) / (N * N);
    }
  }
  const kappa = 1 - pe === 0 ? 0 : (po - pe) / (1 - pe);

  const mean = (a: number[]) =>
    a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

  const per_category: Calibration["per_category"] = {};
  for (const c of CATEGORIES) {
    per_category[c] = {
      truth_count: perCatTruth[c],
      hits: perCatHits[c],
      hit_rate: perCatTruth[c] ? perCatHits[c] / perCatTruth[c] : 0,
    };
  }

  return {
    unit: j.isl.length,
    hits,
    misses: misses.length,
    hit_rate: j.isl.length ? hits / j.isl.length : 0,
    per_category,
    single_category: { n: singleN, kappa, po, pe, confusion },
    confidence: {
      mean_on_hits: mean(confHits),
      mean_on_misses: mean(confMisses),
      n_hits: confHits.length,
      n_misses: confMisses.length,
    },
    miss_list: misses,
  };
}

export function calibrationMarkdown(c: Calibration): string {
  const pct = (x: number | null) => (x === null ? "—" : (x * 100).toFixed(1) + "%");
  const lines: string[] = [];
  lines.push("# Calibration — Clef `category` vs Samtal hand coding", "");
  lines.push("Gögn: Samtal, félag til almannaheilla (talasaman.is), CC BY 4.0", "");
  lines.push(`- Unit: ${c.unit} unique Íslenskast answers`);
  lines.push(`- Hit = Clef argmax ∈ truth category set`);
  lines.push(`- Overall hit rate: **${pct(c.hit_rate)}** (${c.hits}/${c.unit})`);
  lines.push(
    `- Cohen's κ on single-category answers (n=${c.single_category.n}, 8 classes): **${c.single_category.kappa.toFixed(3)}** (po=${c.single_category.po.toFixed(3)}, pe=${c.single_category.pe.toFixed(3)})`,
  );
  lines.push(
    `- Mean Clef confidence: hits ${c.confidence.mean_on_hits === null ? "—" : c.confidence.mean_on_hits.toFixed(3)} (n=${c.confidence.n_hits}) vs misses ${c.confidence.mean_on_misses === null ? "—" : c.confidence.mean_on_misses.toFixed(3)} (n=${c.confidence.n_misses})`,
  );
  lines.push("", "## Per-category hit rate", "");
  lines.push("| truth category | n | hits | hit rate |");
  lines.push("|---|---:|---:|---:|");
  for (const k of CATEGORIES) {
    const r = c.per_category[k];
    lines.push(`| ${k} | ${r.truth_count} | ${r.hits} | ${pct(r.hit_rate)} |`);
  }
  lines.push("", "## Confusion matrix (single-category answers; rows = truth, cols = pred)", "");
  lines.push("| truth \\ pred | " + CATEGORIES.join(" | ") + " |");
  lines.push("|" + "---|".repeat(CATEGORIES.length + 1));
  for (const t of CATEGORIES) {
    lines.push(
      `| **${t}** | ` + CATEGORIES.map((p) => c.single_category.confusion[t][p]).join(" | ") + " |",
    );
  }
  lines.push("", `## Misses (${c.miss_list.length})`, "");
  lines.push("| answer | truth | pred | confidence |");
  lines.push("|---|---|---|---:|");
  for (const m of c.miss_list) {
    const ans = m.answer.replace(/\|/g, "\\|").replace(/\n/g, " ");
    lines.push(
      `| ${ans} | ${m.truth.join("+")} | ${m.pred} | ${m.confidence.toFixed(3)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export function writeCalibration(c: Calibration) {
  writeFileSync("out/calibration.json", JSON.stringify(c, null, 2) + "\n");
  writeFileSync("out/calibration.md", calibrationMarkdown(c));
}
