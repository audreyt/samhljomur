# Samhljómur: spec (lead-authored; implement exactly, report deviations)

A gift from Audrey Tang to Finnur Magnusson (Samtal, talasaman.is) and Atli Þór Jóhannsson (Almannarómur), after her talk at Gróska in Reykjavík on 3 Oct 2026. Data: Samtal's open data at talasaman.is/gogn (CC BY 4.0). Scorecard: Atli's public article "Hvað er gervigreindarfullveldi?" (stadagervigreindar.is, 5 Oct 2026), which defines AI sovereignty as a society's capacity to (1) *vita á hvað við reiðum okkur*, (2) *setja skilyrði*, (3) *geta skipt*, with a *matsspjald* answered *Liggur ekki fyrir / Að hluta / Liggur fyrir* and three routes (*Byggja eða stjórna sjálf / Byggja með öðrum / Kaupa með opnum möguleikum*).

Clef is a classifier: it decides what goes first, what goes second and how many seconds to show, and writes nothing. This build keeps that literally, runs every judgment on a laptop in Reykjavík, and is honest where it does not (music and speech recognition are cloud).

## Hard rules
1. **Verbatim only.** Every Icelandic lyric/display line is a participant's own words from the snapshot, unchanged (no spelling fixes, no paraphrase). Exception: the place-name prefix (text before the first comma of `place`) joined to a verbatim reason sentence with ". ". Machine translations are labelled *vélþýðing / machine gloss* everywhere.
2. **Clef decides, it never writes.** Selection, order and on-screen seconds come from Clef answers + the deterministic rules below. Granite only produces EN glosses. No model writes Icelandic.
3. **Samtal terms** (talasaman.is/gogn): attribution string exactly `Gögn: Samtal, félag til almannaheilla (talasaman.is), CC BY 4.0` on every artifact; no re-identification; never present results as Samtal's position. Every artifact carries: IS "Þetta er hvorki afstaða né niðurstaða Samtals." / EN "This is not Samtal's position or finding."
4. **Privacy gate**: any place whose `place` contains a digit (only `Kambahraun 32, Hveragerði`) is shown as its municipality (text after the comma) everywhere and never sung. Any item with Clef `privacy` ≥ 0.30 is excluded from lyrics and video text (still counted in the report, text shown nowhere). Log every exclusion with its reason.
5. **Everything replayable.** Every model call is logged; `vp run build` must rebuild all artifacts from logs with no model or network; `vp run rerun` re-calls models and writes a diff report.
6. Stack: bun via `vp` (house-stack). Repo `~/w/samhljomur`, git init, commit locally, **do not push or create remotes**.
7. Snapshot is `data/snapshot-20261004/` (already present, sha256 recorded in README). Do not refetch into it; `--live` writes a new dated snapshot dir.

## Models (all local on this Mac in Reykjavík)
- **Clef** `clef:latest` (digest 2bb11a61d1fb), `POST http://127.0.0.1:11434/v1/systemone`, body `{model:"clef", state, questions:{id:{type,...}}, keep_alive:"30m"}`; types `noul {instructions,true,false}`, `choice {instructions,criteria:{key:desc}}` (2-26 keys, no spaces), `score {instructions,criteria:[...]}` (returns `score` = expected index, `probabilities`). Max 64 questions and 64 KiB per request; pack all questions for one item into one call. Concurrency 1. Reference client: `~/w/sensemaking-tools/src/models/systemone.py`.
- **Granite** `granite4.2:30b` (digest be22829aa92a), `POST /api/chat`, `stream:false, think:false, options:{temperature:0.2, num_ctx:4096, seed:1010}`. Probe result: its EN translation of Icelandic is good, its Icelandic *generation* is broken; hence EN glosses only.
- Record `ollama show` digests, `hostname`, timestamps, and per-call latency in the run manifest.

## Stage 1: judgments (Clef). States and questions are fixed text.

State, Íslenskast answer:
```
Spurning á talasaman.is: „Hvað er það íslenskasta í heimi?“
Svar þátttakanda, orðrétt: „{answer}“
```
State, place:
```
Uppáhaldsstaður þátttakanda á Íslandi (talasaman.is/stadir).
Staður: {place}
Ástæða, orðrétt: „{reason}“
```
State, topic word: `Orð sem þátttakendur völdu undir „Hvað viltu tala um?“ á talasaman.is: {word}`

Lyric-candidate questions (Íslenskast answers deduped by exact text → 128 items; all 158 places):
- `privacy` noul: "Does the participant's text (including the place name) contain a street address, a house number, a named private individual, or any other detail that could point to a specific person or household?" true "contains identifying detail" / false "no identifying detail".
- `spelling` noul: "Does the participant's Icelandic text contain obvious spelling or typing errors?" true "has errors" / false "no errors".
- `singable` score: "How well would the participant's text work, word for word, as a sung line in an Icelandic folk song?" ["would not work","awkward","workable","good","beautiful"]
- `image` score: "How vivid and concrete is the image the participant's text evokes?" ["abstract","faint","some image","vivid","unforgettable"]
- `warmth` score: "How much warmth, humour or affection does the participant's text carry?" ["none","a little","some","a lot","overflowing"]
- `tone` choice: "Which tone best describes the participant's text?" {joyful:"joy, delight, playfulness", tender:"tenderness, memory, love", proud:"pride, identity, belonging", wry:"self-mocking humour or gentle criticism", critical:"criticism of society or its shadow sides", calm:"stillness, peace, solitude", unclear:"cannot tell"}
- `seconds` score: "If the participant's text were shown on screen in a music video, how many seconds would a reader need to take it in comfortably?" ["2 seconds","3 seconds","4 seconds","6 seconds","8 seconds","10 seconds"] → expected seconds Σp·[2,3,4,6,8,10].
- `opener` score: "How well would the participant's text work as the first line of a song section?" ["poorly","weakly","fine","well","perfectly"]
- `closer` score: "How well would the participant's text work as the last line of a song section?" same scale.

Íslenskast only, `category` choice (calibration against Samtal's hand coding): "Which category does the participant's answer belong to?" {matur:"Food and drink: dishes, sweets, snacks, eating habits", nattura:"Nature: landscape, water, air, energy, volcanoes, animals, wilderness", samfelag:"Society: solidarity, trust, safety, independence, equality, national self-image, and its shadow sides", sidir:"Customs and traditions: knitwear, swimming pools, family reunions, everyday habits", hugarfar:"Mindset: attitudes such as þetta reddast, resilience, stubbornness", tunga:"Language and culture: the Icelandic language, sagas, manuscripts, culture, special words", vedur:"Weather: the weather, the seasons, light and darkness", annad:"Other: unclear or hard to interpret"}

Places only, `theme` choice: "What is the main reason this place is loved?" {nature:"landscape, mountains, sea, wildlife, natural beauty", stillness:"peace, quiet, solitude, freedom", memory:"childhood, family memories, grandparents, summer houses", home:"where the person lives now, their town", community:"people together, pools, gatherings, welcome", activity:"hiking, riding, swimming, skiing, or work done there", food:"food, restaurants, cafés", culture:"history, stories, culture, art"}

Places with reason > 140 chars: split reason into sentences (split after `.`, `!`, `?` followed by space; keep verbatim). If ≥2 sentences, extra call on the place state with `excerpt` choice: "Which single sentence of the reason is the most beautiful to sing, word for word?" criteria `{s1:"<sentence 1>", s2:...}` (truncate to 26). If one sentence > 140 chars, it is not singable: mark `too_long`, keep for report/map only.

Topic words (68), `topic_theme` choice: "Which theme does this topic word belong to?" {education:"schools, preschools, education", future:"the future, hopes", technology:"AI, technology, innovation", communication:"communication, social media, media, misinformation, phone manners", democracy:"democracy, trust, corruption, governance, politics", nature:"nature, environment", health:"health care, ageing, wellbeing, addiction", economy:"money, housing, transport, traffic, fees, fishing quota, food industry", equality:"equality, gender, racism, immigration, prejudice, LGBTQ, tolerance, respect", culture:"language, culture, arts, music, coffee", youth:"youth work, youth movements", mindset:"optimism, joy, courage, purpose, open-mindedness, creativity"}

## Stage 2: glosses (Granite), with Clef fidelity check
Gloss every Íslenskast answer, every place reason, every selected excerpt, every topic word.
System: `You translate short Icelandic texts written by members of the public into plain English. Translate faithfully; add nothing and leave nothing out. Keep place names in Icelandic. Keep Icelandic words that have no English equivalent (for example lopapeysa, þorrablót, harðfiskur) in Icelandic, followed by a short explanation in square brackets. Do not correct, praise, or comment. Output only the English text.`
User: the verbatim text.
Clef check, state `Icelandic original: „{is}“\nEnglish gloss: “{en}”`, `faithful` noul: "Is the English gloss a faithful translation of the Icelandic original, with no added or missing meaning?" true "faithful" / false "not faithful". If < 0.60, retry Granite with temperature 0 and the user message prefixed `Translate literally: `; max 2 retries; keep the highest-scoring gloss; < 0.60 after retries → `gloss_unverified` (shown with a visible marker). Log all attempts.

## Stage 3: calibration (report numbers exactly; I check them)
Unit = 128 unique Íslenskast answers. Truth = set of Samtal categories the answer appears under. Hit = Clef argmax ∈ truth. Report: overall hit rate, per-category hit rate (by truth category; multi-category answers count toward each), Cohen's κ on single-category answers only (pred vs the single truth, 8 classes), confusion matrix on single-category answers, mean Clef confidence on hits vs misses, and every miss with its text, truth, pred, probabilities. Write `out/calibration.json` + a markdown table. Do not tune questions to the result.

## Stage 4: arrangement → `out/lyrics.json`  (CHECKPOINT: stop here and report)
composite = (singable + image + warmth) / 12, minus 0.15 if spelling ≥ 0.5. Eligible = privacy < 0.30, not `too_long`, Samtal category ≠ annad. Each unique text used at most once in the whole medley (earlier movement wins).
Movements (title IS / EN):
1. **Gluggaveður** / Window-weather. Pool: Íslenskast `vedur`. All eligible, max 8.
2. **Ís í fárviðri** / Ice cream in a storm. Pool: `matur`. Top 12 by composite.
3. **Hringvegurinn** / The Ring Road. Places. Sector = floor(angle/45°) of (lat−64.95, (lng+18.6)·cos 65°) around centre; per sector top 2 by composite (fewer if fewer eligible), max 16 lines. Order: clockwise on the map, i.e. by *decreasing* math angle θ = atan2(dy, dx) (dy = lat−64.95, dx = (lng+18.6)·cos 65°), starting at Reykjavík's θ (64.14, −21.9 → about −150°/210°) so the West Fjords come next, then the north, east and south coast, wrapping round. Refrain: top 4 eligible `nattura` Íslenskast answers by composite, sung as one 2-line refrain after line 4 and again after line 12 (refrain lines repeat; that is the only repetition allowed).
4. **Lopinn og laugin** / Wool and the pool. Pool: `sidir` + `samfelag` except concept `Skuggahliðarnar...`. Top 10. Then bridge **Skuggahliðarnar** / The shadow sides: that concept's eligible answers, max 5, in data order.
5. **Þetta reddast** / It'll all work out. Pool: `hugarfar` + `tunga`. Top 12.
6. **Hvað viltu tala um?** / What do you want to talk about? Topic words with count ≥ 20 in count order, chanted 4 per line joined with ", ", then the final line `Hvernig samfélag viljum við skapa saman?` (Samtal's own tagline; label it as such, not a participant answer).
Within movements 1, 2, 4, 5 and the bridge: first = argmax opener, last = argmax closer (distinct), middle by composite desc, then reorder middle round-robin by tone so the same tone never sits adjacent where avoidable. Every line in lyrics.json carries: text, source (`islenskast:<concept>` or `place:<id>` with URL `https://talasaman.is/stadir?stadur=<id>`), all Clef answers, composite, seconds, gloss + fidelity, lat/lng for places.
Chunks for music: split each movement into chunks of ≤ 10 lines. chunk duration_ms = clamp(6000 + Σ max(4500, 1200·seconds), 20000, 120000), rounded to 1000.

## Stage 5: music (ElevenLabs; key in env `ELEVENLABS_API_KEY`; never print it)
`POST https://api.elevenlabs.io/v1/music?output_format=mp3_48000_192`, `model_id:"music_v2_5"`, `sign_with_c2pa:true`, `composition_plan:{chunks:[{text:"[<chunk title>]\n" + lines.join("\n"), duration_ms, positive_styles, negative_styles, context_adherence}]}`. Seeds 1010, 463, 2026 (three takes). Record response headers (song id). Styles (append "great production quality" to every chunk; negative for all chunks: ["English lyrics","rap","autotune","EDM drop"]):
1. ["Icelandic indie folk","intimate solo female vocal sung in Icelandic","felt piano","harmonium drone","rain on a window","slow 66 bpm","warm analog production"], adherence high
2. ["playful Icelandic folk dance","rímur-style chanted male vocal in Icelandic with group shouts","fiddle","accordion","stomping kitchen percussion","brisk 120 bpm","humorous"], medium
3. ["cinematic road-trip ballad","warm male and female duet sung in Icelandic","fingerpicked acoustic guitar","glockenspiel","brushed drums","rolling 92 bpm","wide open and hopeful"], medium
4. ["cozy Icelandic choral folk","small mixed choir singing in Icelandic","upright bass","Rhodes piano","handclaps","100 bpm"]; bridge: ["sudden hush","wry half-spoken vocal in Icelandic","pizzicato strings","minor key","dry humour"], medium
5. ["Icelandic post-rock anthem","soaring choir and lead vocal in Icelandic","bowed guitar","brass swell","timpani build","glacial crescendo","euphoric"], medium
6. ["ambient choral coda","layered whispered and chanted Icelandic words","music box","solo voice ends on a question","decrescendo to silence"], medium
Continuation chunks of the same movement reuse that movement's styles. If the API rejects the plan, report the exact error; do not silently switch to `prompt`.

## Stage 6: fidelity + alignment (ElevenLabs Scribe v2, `language_code=is`, word timestamps)
Normalize (lowercase, strip punctuation, NFC). Word-level difflib-style alignment of all expected lyric words vs transcript words, constrained so each line's matches fall inside its chunk window (plan durations are enforced by v2.5). Line start/end = first/last matched word times; line fidelity = matched/expected words. Unmatched lines: spread evenly in the gap between neighbours within the chunk. Take score = mean line fidelity (tie → higher min). Pick best; if best < 0.45 generate up to 2 more seeds (4, 5). Output `out/timeline.json` (lines with times, fidelity) and per-take scores. Keep all takes in `media/takes/`.

## Stage 7: artifacts (IS default, EN toggle; every authored string through `bi(is,en)` in one `src/strings.ts`)
- `site/video.html`: the music video player. Canvas 16:9, deterministic `renderAt(t)` (seeded noise; no Math.random). Night-blue ground (#0B1426); Iceland coastline (Natural Earth 50m via world-atlas, public domain) as a thin glowing line, equirectangular with cos 65° x-scale; aurora curtains whose hue follows the movement palette; place dots (rounded coords). Lyrics: lower third, Icelandic verbatim large (Fraunces, OFL, embedded), EN gloss smaller below (toggle). Per movement: 1 slate/rain streaks on glass; 2 amber, food words fall and stack like snow; 3 moss green, the ring road draws itself sector by sector and each sung place pulses with its name label; 4 wool cream/red, a lopapeysa yoke pattern (concentric rings of knitted motifs) builds stitch by stitch, shifting to minor/grey for the bridge; 5 full aurora bloom green→magenta; 6 topic words become stars sized by count, then the question alone. Controls: play/pause, scrub, IS/EN, and an "inspect" overlay showing each current line's source link and Clef answers. Small persistent credit + disclaimer.
- `site/medley.mp4`: 1920×1080 30 fps by stepping `renderAt` in headless Chromium (Playwright; if it fails under bun, run that one script under node via vp and document why), muxed with the chosen take, H.264 CRF 20, AAC 192k.
- `site/report.html` "Hvað sögðu þau?" / "What did they say?": key numbers; Íslenskast with Samtal's hand coding vs Clef (calibration numbers, confusion table, disagreements as the most interesting reading); places map coloured by Clef theme with filter and full verbatim reasons + glosses; topic words grouped by Clef theme; "Eftir 10. október" (how the same pipeline takes Saturday's summaries: one Clef pass per summary, report back to each circle first, then a medley v2); **Matsspjald**: Atli's three questions applied to this pipeline (content below); **Endurspilun**: replay commands, snapshot hashes, model digests, log paths. 
- `site/songbook.pdf` + `site/songbook.html`: the lyric sheet by movement, each line with its source, so a choir or a school circle could sing it on 10 October. Print-clean A5.
- `site/index.html`: landing, poster frame, three doors (Myndband / Skýrsla / Söngbók), credits.
- All pages self-contained except media files; the video page also has a `video-standalone.html` with audio inlined.

Matsspjald content (use exactly; render as a 3×3 grid of rows = my three items below × answer):
- *Vitum við á hvað við reiðum okkur?* Dómar: Clef 27B, opin vigt, Apache-2.0, digest, keyrt á fartölvu í Reykjavík → **Liggur fyrir**. Þýðingar: Granite 4.2 30B, opin vigt, Apache-2.0, keyrt á sömu vél → **Liggur fyrir**. Tónlist og talgreining: ElevenLabs Music v2.5 og Scribe v2 í skýi → **Að hluta** (we know vendor, request and output, C2PA-signed, not the weights).
- *Höfum við sett skilyrði?* CC BY 4.0 and Samtal's terms honoured (privacy gate, disclaimer); every gloss checked by Clef; every sung line checked by speech recognition → **Liggur fyrir** for judgments and glosses, **Að hluta** for music.
- *Getum við skipt?* Judgments: any System One model on the same endpoint; `vp run rerun --model <x>` diffs it → **Liggur fyrir**. Glosses: any local model → **Liggur fyrir**. Music: the lyrics, order and timings are ours; the singer is replaceable, best of all by a choir in Iceland (the songbook) → **Liggur fyrir**.
- Placement on Atli's two axes: judgments + glosses = *Byggja eða stjórna sjálf*; music = *Kaupa með opnum möguleikum*.
EN versions alongside. Credit Atli's framework by name with a link to his article.

## Verification gates (run, keep evidence under `qa/`)
- Coverage gate script: every lyric line present in video timeline, report and songbook; zero empty strings; every authored string has `is` and `en`; every gloss labelled; attribution + disclaimer on every page; no participant text excluded by the privacy gate appears anywhere in `site/`.
- Verbatim gate: every Icelandic participant line in `site/` is a byte-exact substring of the snapshot.
- Clef `natural_is` noul on every authored Icelandic UI string: "Is this natural, grammatical Icelandic?" true "natural Icelandic" / false "unnatural or ungrammatical"; list all < 0.70.
- Replay gate: delete `out/`, `vp run build` offline (ollama stopped or blocked), byte-identical `out/lyrics.json` and `out/timeline.json`.
- Browser: Playwright screenshots of every page at 390, 768, 1280, 1920 widths, IS and EN; video frames at the midpoint of every movement; console errors = fail.
- mp4: ffprobe duration matches audio ±0.1 s.

## Amendment A (lead, after checkpoint review; supersedes conflicting text above)
A1. **Iceland only.** Places outside lat 63.0–66.7, lng −24.6 to −13.4 are excluded from lyrics, map and video (counted in the report as "utan Íslands / outside Iceland", text not shown). This removes one entry.
A2. **The people's weight beats Clef's taste.** Any Íslenskast answer with max `count` ≥ 3 is always included in its movement (first matching movement wins), before filling to the cap by composite; the cap grows if needed. Today that adds Þetta reddast (10), Harðfiskur (5), Kjötsúpa (3), Sundlaugar (3), Tungumálið (3).
A3. **Title lines close their movement.** The answer that gives a movement its title is always included and placed as that movement's closer: m1 `Gluggaveður`, m2 `Ís í fárviðri`, m5 `Þetta reddast`. This overrides argmax-closer. A2 and A3 inclusions and every other non-Clef decision are written to `out/overrides.json` with a reason, and shown in the inspector ("Ritstjórn / Editorial" with the reason) and the report.
A4. **Count badge.** Every Íslenskast line carries `count` (max over its rows); show `×N` when N ≥ 2 in video, songbook and report.
A5. **Sung text vs display text.** Text sent to the music API = verbatim with emoji and the characters ” “ „ " removed and whitespace collapsed. Display everywhere stays byte-verbatim. The verbatim gate checks display text.
A6. **Gloss bake-off (Atli's "Getum við skipt?", done for real).** Add `gemma4:31b-it-qat-google-official` as a second translator: identical system prompt, user text, options and retry rule. Clef `faithful` on every candidate. Chosen gloss = higher faithful; if within 0.05, prefer Gemma. Keep Granite's gloss and both scores in `out/glosses.json`. Write `out/gloss-bakeoff.json` + `.md`: mean faithful per model, wins per model, count < 0.60 per model, and the side-by-side table. Granite stays the first, logged translator; nothing is hidden. Lead spot-check (fixed, report as stated): on 14 items where Granite's gloss was visibly wrong, Gemma's was right on 12 (lead review).
A7. **Editorial gloss edits.** `copy/gloss-edits.json` (lead-authored, `{ "<IS text>": "<EN>" }`) overrides the chosen gloss; such glosses are labelled `ritstýrt / edited` instead of `vélþýðing / machine gloss`, and listed in the report. Apply if the file exists; rebuild when it changes.
A8. Lead editorial credit string (add to strings): IS "Ritstjórn: Devin, gervigreindaraðstoðarmaður Audrey" / EN "Editing: Devin, Audrey's AI assistant".

## Amendment B (lead): Apertus 1.5, the open Swiss model, as a third translator
B1. Add **Apertus 1.5 8B** (text branch, MLX 8-bit, `/Users/au/Models/Apertus-v1.5-8B-text-MLX-8bit`, from m1rkocasu/Apertus-v1.5-8B-text-MLX-8bit; base swiss-ai/Apertus-v1.5-8B, Apache-2.0) served by `mlx_lm.server` at `http://127.0.0.1:8003/v1/chat/completions`, model id = that path. Identical system prompt and user text; `temperature 0.2, max_tokens 400, chat_template_kwargs:{enable_thinking:false}` (thinking on was slower and no better in the lead probe). Same retry rule (literal retry at temperature 0). Clef runs concurrently (it fits beside the 8 GB model).
B2. **Apertus 1.5 70B** is being prepared by the lead (download + text-branch conversion + 4-bit MLX). When it exists it joins by the same mechanism as a fourth candidate; the code must take the translator list from one config table so adding it is a one-line change.
B3. **Selection** over all candidates: highest Clef `faithful`; any candidate within 0.05 of the best is eligible, tie-break order Gemma > Apertus 70B > Apertus 8B > Granite. Editorial edits (A7) still override.
B4. Bake-off outputs per model: mean faithful, wins, count < 0.60, median latency per gloss; side-by-side table gets a column per model.
B5. Lead spot-check sentence: "On 14 items where Granite's gloss was visibly wrong, Gemma's was right on 12 and Apertus 1.5 8B's on 8 (lead review)." Other models probed by the lead tonight and not added: Qwen 3.8 Flash Next 8 of 14; Kolibri-1 2 of 14 (thinking off).

## Amendment C (lead, supersedes B3 and the "gloss_unverified" marker)
C1. Clef `faithful` is NOT a usable translation judge: on the three-way run it preferred "Sail" for "Seigla", "coconut milk" for "kókómjólk", "boiled eel" for "soðin ýsa", "phone booths" for "símasiðir", "solitude" for "einhverfa", and scored correct Gemma glosses (autism, gambling addiction, telephone etiquette) below 0.6. Keep computing and showing it, never select by it.
C2. **Selection**: chosen gloss = Gemma 4 31B for every text, unless `copy/gloss-edits.json` overrides it (now 34 entries). All candidates and their Clef scores stay in `out/glosses.json` and the report table. Wins/means stay in the stats table but the "chosen" column now reflects C2.
C3. Drop the `óstaðfest vélþýðing / unverified machine gloss` label everywhere (it was derived from Clef faithful). Machine glosses are `vélþýðing / machine gloss`; edited ones `ritstýrt / edited`.
C4. Matsspjald: Q2 for glosses becomes **Að hluta** (string `q2_glosses` updated). Q1 and Q3 unchanged.
C5. Apertus 1.5 70B, when it lands (port 8004), is a display candidate under the same rule; the lead decides separately whether it replaces Gemma as default.

## Amendment D (lead): 華文 (zh-Hant-TW) as a third language
D1. Toggle becomes three buttons, `Íslenska / English / 華文`, on every page (index, video, standalone, report, songbook HTML). Default stays Íslenska. Persist choice in localStorage. `<html lang>` follows the mode (`is`, `en`, `zh-Hant-TW`). Every authored string now has `is`, `en`, `zh` in `copy/strings.json` (lead-authored, verbatim); coverage gate requires all three.
D2. Participant text stays byte-verbatim Icelandic in every mode. In 華文 mode the gloss line shows the zh gloss; the EN gloss is not shown. The MP4 stays Icelandic + English (no re-render needed for D); the songbook PDF stays IS + EN.
D3. **zh glosses**: one per text that has an EN gloss (all 386 + refrain parts + topic words + tagline), produced by Gemma 4 31B (`gemma4:31b-it-qat-google-official`, /api/chat, `think:false, temperature 0.2, num_ctx 4096, seed 1010`), logged and cached like every other model call. Input is the Icelandic original plus the final EN gloss (chosen or edited).
System prompt (verbatim):
`你把冰島民眾寫的短句翻成台灣慣用的繁體中文。你會拿到冰島語原文和一則已經查核過的英文譯文；以冰島語原文為準，英文譯文只用來確認意思。忠實翻譯，不增不減，不評論，不糾正錯字。地名保留冰島語原文。沒有對應中文的冰島詞（例如 lopapeysa、þorrablót、harðfiskur）保留原文，後面用全形括號加上簡短說明。使用全形標點；中文與拉丁字母或數字之間加半形空格。只輸出中文譯文。`
User message: `冰島語原文：{is}\n英文譯文：{en}`
No Clef scoring of zh glosses (C1). zh glosses are labelled `機器譯文`; lead edits go in `copy/gloss-edits-zh.json` (`{ "<IS text>": "<zh>" }`, label `已校訂`), applied if present.
D4. zh text checks (gate): `opencc -c t2s` round-trip shows no Simplified-only characters (i.e. `opencc -c s2twp` applied to each zh string is a no-op; list any that change); CJK–Latin/digit spacing per pangu (`~/.local/bin/pangu.pl` must be a no-op on each zh string; list diffs); no em dashes.
D5. Font: Iansui (OFL; `~/Library/Fonts/Iansui-Regular.ttf`), subset with `pyftsubset` to exactly the CJK + punctuation glyphs used across all zh strings and zh glosses, embedded as woff2 in each page. Never embed jf fonts (licence forbids redistribution). Browser check: in 華文 mode `document.fonts.check('16px Iansui', '<sample>')` true and no fallback-font glyph boxes; screenshots of every page × 4 widths in 華文.
D6. Report: the Matsspjald, bake-off and calibration sections render fully in 華文; tables keep model names Latin.
