// Snapshot loading and item construction (Stage-1 inputs).

import { readFileSync } from "node:fs";
import { SNAPSHOT_DIR } from "./spec";

export interface IslItem {
  answer: string;
  concepts: string[]; // data order, deduped
  conceptLabels: string[];
  categories: string[]; // Samtal truth set, data order deduped
  counts: number[];
  rowIndex: number; // first data row
}

export interface PlaceItem {
  id: string;
  place: string;
  placePrefix: string; // text before first comma
  placeDisplay: string; // municipality for digit places, else prefix
  hasDigit: boolean;
  reason: string;
  lat: number;
  lng: number;
  sentences: string[]; // split after .,!,? + space; [reason] if <=140
  needsExcerpt: boolean; // reason >140 and >=2 sentences
  tooLong: boolean; // any single sentence >140
  rowIndex: number;
}

export interface TopicItem {
  word: string;
  count: number;
  rowIndex: number;
}

export interface Snapshot {
  isl: IslItem[];
  places: PlaceItem[];
  topics: TopicItem[];
}

function load(dataset: string): { data: any[]; meta: any } {
  return JSON.parse(readFileSync(`${SNAPSHOT_DIR}/${dataset}.json`, "utf8"));
}

// Split after '.', '!', '?' followed by a space; punctuation stays with the
// sentence (verbatim).
export function splitSentences(reason: string): string[] {
  return reason.split(/(?<=[.!?]) /);
}

export function loadSnapshot(): Snapshot {
  const islRows = load("islenskast").data as any[];
  const seen = new Map<string, IslItem>();
  islRows.forEach((r, i) => {
    const cur = seen.get(r.answer);
    if (cur) {
      if (!cur.concepts.includes(r.concept)) {
        cur.concepts.push(r.concept);
        cur.conceptLabels.push(r.conceptLabel);
      }
      if (!cur.categories.includes(r.category)) cur.categories.push(r.category);
      cur.counts.push(r.count);
    } else {
      seen.set(r.answer, {
        answer: r.answer,
        concepts: [r.concept],
        conceptLabels: [r.conceptLabel],
        categories: [r.category],
        counts: [r.count],
        rowIndex: i,
      });
    }
  });
  const isl = [...seen.values()];

  const places = (load("places").data as any[]).map((p, i) => {
    const hasDigit = /\d/.test(p.place);
    const comma = p.place.indexOf(",");
    const prefix = comma === -1 ? p.place : p.place.slice(0, comma);
    const municipality = comma === -1 ? p.place : p.place.slice(comma + 1).trim();
    const sentences =
      p.reason.length > 140 ? splitSentences(p.reason) : [p.reason];
    return {
      id: p.id,
      place: p.place,
      placePrefix: prefix,
      placeDisplay: hasDigit ? municipality : prefix,
      hasDigit,
      reason: p.reason,
      lat: p.lat,
      lng: p.lng,
      sentences,
      needsExcerpt: p.reason.length > 140 && sentences.length >= 2,
      tooLong: sentences.some((s) => s.length > 140),
      rowIndex: i,
    } as PlaceItem;
  });

  const topics = (load("topics").data as any[]).map((t, i) => ({
    word: t.word,
    count: t.count,
    rowIndex: i,
  }));

  return { isl, places, topics };
}
