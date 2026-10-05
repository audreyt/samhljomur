// Fixed text and constants from SPEC.md. Do not reword.

export const CLEF_MODEL = "clef";
export const GRANITE_MODEL = "granite4.2:30b";
export const CLEF_DIGEST = "2bb11a61d1fb";
export const GRANITE_DIGEST = "be22829aa92a";
export const BASE_URL = "http://127.0.0.1:11434";
export const KEEP_ALIVE = "30m";

export const ATTRIBUTION =
  "Gögn: Samtal, félag til almannaheilla (talasaman.is), CC BY 4.0";
export const DISCLAIMER_IS =
  "Þetta er hvorki afstaða né niðurstaða Samtals.";
export const DISCLAIMER_EN = "This is not Samtal's position or finding.";
export const TAGLINE = "Hvernig samfélag viljum við skapa saman?";

export const SNAPSHOT_DIR = "data/snapshot-20261004";

export function islState(answer: string): string {
  return (
    "Spurning á talasaman.is: „Hvað er það íslenskasta í heimi?“\n" +
    `Svar þátttakanda, orðrétt: „${answer}“`
  );
}

export function placeState(place: string, reason: string): string {
  return (
    "Uppáhaldsstaður þátttakanda á Íslandi (talasaman.is/stadir).\n" +
    `Staður: ${place}\n` +
    `Ástæða, orðrétt: „${reason}“`
  );
}

export function topicState(word: string): string {
  return `Orð sem þátttakendur völdu undir „Hvað viltu tala um?“ á talasaman.is: ${word}`;
}

export function faithfulState(is: string, en: string): string {
  return `Icelandic original: „${is}“\nEnglish gloss: “${en}”`;
}

export type Question =
  | { type: "noul"; instructions: string; criteria: { true: string; false: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };

export function lyricQuestions(): Record<string, Question> {
  return {
    privacy: {
      type: "noul",
      instructions:
        "Does the participant's text (including the place name) contain a street address, a house number, a named private individual, or any other detail that could point to a specific person or household?",
      criteria: {
        true: "contains identifying detail",
        false: "no identifying detail",
      },
    },
    spelling: {
      type: "noul",
      instructions:
        "Does the participant's Icelandic text contain obvious spelling or typing errors?",
      criteria: { true: "has errors", false: "no errors" },
    },
    singable: {
      type: "score",
      instructions:
        "How well would the participant's text work, word for word, as a sung line in an Icelandic folk song?",
      criteria: [
        "would not work",
        "awkward",
        "workable",
        "good",
        "beautiful",
      ],
    },
    image: {
      type: "score",
      instructions:
        "How vivid and concrete is the image the participant's text evokes?",
      criteria: ["abstract", "faint", "some image", "vivid", "unforgettable"],
    },
    warmth: {
      type: "score",
      instructions:
        "How much warmth, humour or affection does the participant's text carry?",
      criteria: ["none", "a little", "some", "a lot", "overflowing"],
    },
    tone: {
      type: "choice",
      instructions: "Which tone best describes the participant's text?",
      criteria: {
        joyful: "joy, delight, playfulness",
        tender: "tenderness, memory, love",
        proud: "pride, identity, belonging",
        wry: "self-mocking humour or gentle criticism",
        critical: "criticism of society or its shadow sides",
        calm: "stillness, peace, solitude",
        unclear: "cannot tell",
      },
    },
    seconds: {
      type: "score",
      instructions:
        "If the participant's text were shown on screen in a music video, how many seconds would a reader need to take it in comfortably?",
      criteria: [
        "2 seconds",
        "3 seconds",
        "4 seconds",
        "6 seconds",
        "8 seconds",
        "10 seconds",
      ],
    },
    opener: {
      type: "score",
      instructions:
        "How well would the participant's text work as the first line of a song section?",
      criteria: ["poorly", "weakly", "fine", "well", "perfectly"],
    },
    closer: {
      type: "score",
      instructions:
        "How well would the participant's text work as the last line of a song section?",
      criteria: ["poorly", "weakly", "fine", "well", "perfectly"],
    },
  };
}

export function categoryQuestion(): Question {
  return {
    type: "choice",
    instructions: "Which category does the participant's answer belong to?",
    criteria: {
      matur:
        "Food and drink: dishes, sweets, snacks, eating habits",
      nattura:
        "Nature: landscape, water, air, energy, volcanoes, animals, wilderness",
      samfelag:
        "Society: solidarity, trust, safety, independence, equality, national self-image, and its shadow sides",
      sidir:
        "Customs and traditions: knitwear, swimming pools, family reunions, everyday habits",
      hugarfar:
        "Mindset: attitudes such as þetta reddast, resilience, stubbornness",
      tunga:
        "Language and culture: the Icelandic language, sagas, manuscripts, culture, special words",
      vedur: "Weather: the weather, the seasons, light and darkness",
      annad: "Other: unclear or hard to interpret",
    },
  };
}

export function themeQuestion(): Question {
  return {
    type: "choice",
    instructions: "What is the main reason this place is loved?",
    criteria: {
      nature: "landscape, mountains, sea, wildlife, natural beauty",
      stillness: "peace, quiet, solitude, freedom",
      memory: "childhood, family memories, grandparents, summer houses",
      home: "where the person lives now, their town",
      community: "people together, pools, gatherings, welcome",
      activity: "hiking, riding, swimming, skiing, or work done there",
      food: "food, restaurants, cafés",
      culture: "history, stories, culture, art",
    },
  };
}

export function topicThemeQuestion(): Question {
  return {
    type: "choice",
    instructions: "Which theme does this topic word belong to?",
    criteria: {
      education: "schools, preschools, education",
      future: "the future, hopes",
      technology: "AI, technology, innovation",
      communication:
        "communication, social media, media, misinformation, phone manners",
      democracy: "democracy, trust, corruption, governance, politics",
      nature: "nature, environment",
      health: "health care, ageing, wellbeing, addiction",
      economy:
        "money, housing, transport, traffic, fees, fishing quota, food industry",
      equality:
        "equality, gender, racism, immigration, prejudice, LGBTQ, tolerance, respect",
      culture: "language, culture, arts, music, coffee",
      youth: "youth work, youth movements",
      mindset:
        "optimism, joy, courage, purpose, open-mindedness, creativity",
    },
  };
}

export function excerptQuestion(sentences: string[]): Question {
  const criteria: Record<string, string> = {};
  sentences.slice(0, 26).forEach((s, i) => {
    criteria[`s${i + 1}`] = s;
  });
  return {
    type: "choice",
    instructions:
      "Which single sentence of the reason is the most beautiful to sing, word for word?",
    criteria,
  };
}

export function faithfulQuestion(): Question {
  return {
    type: "noul",
    instructions:
      "Is the English gloss a faithful translation of the Icelandic original, with no added or missing meaning?",
    criteria: { true: "faithful", false: "not faithful" },
  };
}

export const GLOSS_SYSTEM =
  "You translate short Icelandic texts written by members of the public into plain English. " +
  "Translate faithfully; add nothing and leave nothing out. Keep place names in Icelandic. " +
  "Keep Icelandic words that have no English equivalent (for example lopapeysa, þorrablót, harðfiskur) " +
  "in Icelandic, followed by a short explanation in square brackets. " +
  "Do not correct, praise, or comment. Output only the English text.";

export const GEMMA_MODEL = "gemma4:31b-it-qat-google-official";
export const GEMMA_DIGEST = "e0812a55773b"; // Apache-2.0, on-device
export const APERTUS_MODEL = "/Users/au/Models/Apertus-v1.5-8B-text-MLX-8bit";
export const TRANSLATE_OPTIONS = {
  temperature: 0.2,
  num_ctx: 4096,
  seed: 1010,
};
export const GRANITE_OPTIONS = TRANSLATE_OPTIONS;
export const GRANITE_RETRY_OPTIONS = {
  temperature: 0,
  num_ctx: 4096,
  seed: 1010,
};
export const RETRY_PREFIX = "Translate literally: ";
export const GLOSS_EDITS_PATH = "copy/gloss-edits.json";

// ---- B1/B2: translator config table (one line per model; Apertus 70B joins
// later as the same openai-chat api on port 8004) ----
export interface TranslatorCfg {
  id: string; // cache + log namespace
  name: string; // display name
  api: "ollama-chat" | "openai-chat";
  url: string;
  model: string;
  options: Record<string, unknown>; // ollama `options` / openai top-level
  retry_options: Record<string, unknown>;
}
export const TRANSLATORS: TranslatorCfg[] = [
  {
    id: "granite",
    name: "Granite 4.2 30B",
    api: "ollama-chat",
    url: `${BASE_URL}/api/chat`,
    model: GRANITE_MODEL,
    options: TRANSLATE_OPTIONS,
    retry_options: GRANITE_RETRY_OPTIONS,
  },
  {
    id: "gemma",
    name: "Gemma 4 31B",
    api: "ollama-chat",
    url: `${BASE_URL}/api/chat`,
    model: GEMMA_MODEL,
    options: TRANSLATE_OPTIONS,
    retry_options: GRANITE_RETRY_OPTIONS,
  },
  {
    id: "apertus",
    name: "Apertus 1.5 8B",
    api: "openai-chat",
    url: "http://127.0.0.1:8003/v1/chat/completions",
    model: APERTUS_MODEL,
    options: {
      temperature: 0.2,
      max_tokens: 400,
      chat_template_kwargs: { enable_thinking: false },
    },
    retry_options: {
      temperature: 0,
      max_tokens: 400,
      chat_template_kwargs: { enable_thinking: false },
    },
  },
];
// B3: within 0.05 of the best faithful, eligible; first in this order wins.
export const TIE_ORDER = ["gemma", "apertus70", "apertus", "granite"];
export const STRINGS_PATH = "copy/strings.json";

// A1: Iceland bounding box for places
export const ICELAND_BBOX = { latMin: 63.0, latMax: 66.7, lngMin: -24.6, lngMax: -13.4 };

// A2: popularity floor
export const COUNT_FLOOR = 3;

// A3: title answers that close their movement
export const TITLE_CLOSERS: Record<number, string> = {
  1: "Gluggaveður",
  2: "Ís í fárviðri",
  5: "Þetta reddast",
};

// A5: sung text = verbatim minus emoji and ” “ „ " chars, whitespace collapsed
export function sungText(s: string): string {
  return s
    .replace(/[”“„"]/g, "")
    .replace(/[\p{Extended_Pictographic}️‍]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ElevenLabs (stages 5-6)
export const EL_MUSIC_URL =
  "https://api.elevenlabs.io/v1/music?output_format=mp3_48000_192";
export const EL_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";
export const EL_MUSIC_MODEL = "music_v2_5";
export const EL_STT_MODEL = "scribe_v2";
export const SEEDS = [1010, 463, 2026];
export const EXTRA_SEEDS = [4, 5];
export const TAKE_SCORE_MIN = 0.45;

export const SECONDS_SCALE = [2, 3, 4, 6, 8, 10];
export const PRIVACY_THRESHOLD = 0.3;
export const FAITHFUL_THRESHOLD = 0.6;
export const MAX_GLOSS_RETRIES = 2;
export const CATEGORIES = [
  "matur",
  "nattura",
  "samfelag",
  "sidir",
  "hugarfar",
  "tunga",
  "vedur",
  "annad",
] as const;
export const SKUGGI_CONCEPT = "skuggi";

// Movement titles (IS / EN) from SPEC stage 4.
export const MOVEMENTS = [
  { n: 1, is: "Gluggaveður", en: "Window-weather" },
  { n: 2, is: "Ís í fárviðri", en: "Ice cream in a storm" },
  { n: 3, is: "Hringvegurinn", en: "The Ring Road" },
  { n: 4, is: "Lopinn og laugin", en: "Wool and the pool" },
  { n: 5, is: "Þetta reddast", en: "It'll all work out" },
  { n: 6, is: "Hvað viltu tala um?", en: "What do you want to talk about?" },
] as const;
export const BRIDGE_TITLE = {
  is: "Skuggahliðarnar",
  en: "The shadow sides",
};

// Stage-5 style blocks (fixed by spec; embedded so stage 5 just composes).
export const NEGATIVE_STYLES = [
  "English lyrics",
  "rap",
  "autotune",
  "EDM drop",
];
export const MOVEMENT_STYLES: Record<
  number,
  { positive_styles: string[]; context_adherence: string }
> = {
  1: {
    positive_styles: [
      "Icelandic indie folk",
      "intimate solo female vocal sung in Icelandic",
      "felt piano",
      "harmonium drone",
      "rain on a window",
      "slow 66 bpm",
      "warm analog production",
      "great production quality",
    ],
    context_adherence: "high",
  },
  2: {
    positive_styles: [
      "playful Icelandic folk dance",
      "rímur-style chanted male vocal in Icelandic with group shouts",
      "fiddle",
      "accordion",
      "stomping kitchen percussion",
      "brisk 120 bpm",
      "humorous",
      "great production quality",
    ],
    context_adherence: "medium",
  },
  3: {
    positive_styles: [
      "cinematic road-trip ballad",
      "warm male and female duet sung in Icelandic",
      "fingerpicked acoustic guitar",
      "glockenspiel",
      "brushed drums",
      "rolling 92 bpm",
      "wide open and hopeful",
      "great production quality",
    ],
    context_adherence: "medium",
  },
  4: {
    positive_styles: [
      "cozy Icelandic choral folk",
      "small mixed choir singing in Icelandic",
      "upright bass",
      "Rhodes piano",
      "handclaps",
      "100 bpm",
      "great production quality",
    ],
    context_adherence: "medium",
  },
  5: {
    positive_styles: [
      "Icelandic post-rock anthem",
      "soaring choir and lead vocal in Icelandic",
      "bowed guitar",
      "brass swell",
      "timpani build",
      "glacial crescendo",
      "euphoric",
      "great production quality",
    ],
    context_adherence: "medium",
  },
  6: {
    positive_styles: [
      "ambient choral coda",
      "layered whispered and chanted Icelandic words",
      "music box",
      "solo voice ends on a question",
      "decrescendo to silence",
      "great production quality",
    ],
    context_adherence: "medium",
  },
};
export const BRIDGE_STYLES = {
  positive_styles: [
    "sudden hush",
    "wry half-spoken vocal in Icelandic",
    "pizzicato strings",
    "minor key",
    "dry humour",
    "great production quality",
  ],
  context_adherence: "medium",
};

// ---- D3: zh glosses (Gemma; no Clef scoring per C1) ----
export const ZH_GLOSS_SYSTEM =
  "你把冰島民眾寫的短句翻成台灣慣用的繁體中文。你會拿到冰島語原文和一則已經查核過的英文譯文；以冰島語原文為準，英文譯文只用來確認意思。忠實翻譯，不增不減，不評論，不糾正錯字。地名保留冰島語原文。沒有對應中文的冰島詞（例如 lopapeysa、þorrablót、harðfiskur）保留原文，後面用全形括號加上簡短說明。使用全形標點；中文與拉丁字母或數字之間加半形空格。只輸出中文譯文。";
export const zhGlossUser = (is: string, en: string) =>
  `冰島語原文：${is}\n英文譯文：${en}`;
export const ZH_GLOSS_OPTIONS = { temperature: 0.2, num_ctx: 4096, seed: 1010 };
export const ZH_EDITS_PATH = "copy/gloss-edits-zh.json";
