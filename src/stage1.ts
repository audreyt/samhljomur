// Stage 1: Clef judgments -> out/judgments.json

import { writeFileSync } from "node:fs";
import {
  clef,
  RunCtx,
  ClefAnswers,
} from "./model";
import {
  categoryQuestion,
  excerptQuestion,
  islState,
  lyricQuestions,
  placeState,
  themeQuestion,
  topicState,
  topicThemeQuestion,
} from "./spec";
import { loadSnapshot, Snapshot } from "./data";

export interface IslJudgment {
  answer: string;
  concepts: string[];
  conceptLabels: string[];
  categories: string[];
  counts: number[];
  rowIndex: number;
  clef: ClefAnswers;
  clef_sha: string;
}

export interface PlaceJudgment {
  id: string;
  place: string;
  placePrefix: string;
  placeDisplay: string;
  hasDigit: boolean;
  reason: string;
  lat: number;
  lng: number;
  sentences: string[];
  needsExcerpt: boolean;
  tooLong: boolean;
  rowIndex: number;
  clef: ClefAnswers;
  clef_sha: string;
  excerpt?: { choice: string; index: number; sentence: string; clef: unknown; clef_sha: string };
}

export interface TopicJudgment {
  word: string;
  count: number;
  rowIndex: number;
  clef: ClefAnswers;
  clef_sha: string;
}

export interface Judgments {
  isl: IslJudgment[];
  places: PlaceJudgment[];
  topics: TopicJudgment[];
}

export async function stage1(
  ctx: RunCtx,
  snap?: Snapshot,
  limit = 0,
): Promise<Judgments> {
  const s = snap ?? loadSnapshot();
  const out: Judgments = { isl: [], places: [], topics: [] };
  const L = (n: number) => (limit > 0 ? Math.min(n, limit) : n);

  const isl = s.isl.slice(0, L(s.isl.length));
  for (const [i, item] of isl.entries()) {
    const q: Record<string, unknown> = {
      ...lyricQuestions(),
      category: categoryQuestion(),
    };
    const { answers, sha } = await clef(
      ctx,
      islState(item.answer),
      q,
      `isl:${item.answer.slice(0, 30)}`,
    );
    out.isl.push({
      answer: item.answer,
      concepts: item.concepts,
      conceptLabels: item.conceptLabels,
      categories: item.categories,
      counts: item.counts,
      rowIndex: item.rowIndex,
      clef: answers,
      clef_sha: sha,
    });
    if ((i + 1) % 20 === 0) console.log(`[stage1] isl ${i + 1}/${isl.length}`);
  }

  const places = s.places.slice(0, L(s.places.length));
  for (const [i, p] of places.entries()) {
    const q: Record<string, unknown> = {
      ...lyricQuestions(),
      theme: themeQuestion(),
    };
    const { answers, sha } = await clef(
      ctx,
      placeState(p.place, p.reason),
      q,
      `place:${p.place.slice(0, 30)}`,
    );
    const pj: PlaceJudgment = {
      id: p.id,
      place: p.place,
      placePrefix: p.placePrefix,
      placeDisplay: p.placeDisplay,
      hasDigit: p.hasDigit,
      reason: p.reason,
      lat: p.lat,
      lng: p.lng,
      sentences: p.sentences,
      needsExcerpt: p.needsExcerpt,
      tooLong: p.tooLong,
      rowIndex: p.rowIndex,
      clef: answers,
      clef_sha: sha,
    };
    if (p.needsExcerpt) {
      const ex = await clef(
        ctx,
        placeState(p.place, p.reason),
        { excerpt: excerptQuestion(p.sentences) },
        `excerpt:${p.place.slice(0, 30)}`,
      );
      const choice = ex.answers.excerpt as { choice?: string };
      const key = choice?.choice ?? "s1";
      const idx = Math.max(
        0,
        Math.min(p.sentences.length - 1, parseInt(key.slice(1), 10) - 1 || 0),
      );
      pj.excerpt = {
        choice: key,
        index: idx,
        sentence: p.sentences[idx],
        clef: ex.answers.excerpt,
        clef_sha: ex.sha,
      };
    }
    out.places.push(pj);
    if ((i + 1) % 20 === 0)
      console.log(`[stage1] places ${i + 1}/${places.length}`);
  }

  const topics = s.topics.slice(0, L(s.topics.length));
  for (const [i, t] of topics.entries()) {
    const { answers, sha } = await clef(
      ctx,
      topicState(t.word),
      { topic_theme: topicThemeQuestion() },
      `topic:${t.word}`,
    );
    out.topics.push({
      word: t.word,
      count: t.count,
      rowIndex: t.rowIndex,
      clef: answers,
      clef_sha: sha,
    });
    if ((i + 1) % 20 === 0)
      console.log(`[stage1] topics ${i + 1}/${topics.length}`);
  }

  return out;
}

export function writeJudgments(j: Judgments, path = "out/judgments.json") {
  writeFileSync(path, JSON.stringify(j, null, 2) + "\n");
}
