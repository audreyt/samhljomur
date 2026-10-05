# Deviations and interpretation calls

Everything below is a spot where SPEC.md admitted more than one reading; the
most literal reading was chosen and the build kept going. No spec text was
changed.

## Stage 1–2

1. **`excerpt` criteria "truncate to 26"** — read as *truncate to 26 sentences*
   (the `choice` type allows max 26 keys), i.e. `s1`–`s26`, not truncating each
   sentence to 26 characters. No reason has more than 26 sentences anyway, so
   this is moot on this snapshot.
2. **`excerpt` call vs `too_long`** — the spec states both rules for reasons
   >140 chars without saying they are exclusive. Implemented literally: the
   excerpt call runs whenever there are ≥2 sentences, and `too_long` is set
   independently whenever any single sentence exceeds 140 chars. A `too_long`
   place keeps its excerpt answer in `out/judgments.json` but is not singable.
3. **Tagline gloss** — the spec's Stage-2 gloss list (answers, reasons,
   excerpts, topic words) does not mention the movement-6 closing line
   `Hvernig samfélag viljum við skapa saman?`, but every lyric line must carry
   an EN gloss. It goes through the identical Granite + Clef-fidelity pipeline
   as a `kind: "tagline"` entry.
4. **Granite `keep_alive: "30m"`** — added to the `/api/chat` body (not in the
   spec's literal field list) to keep the model resident; does not affect
   outputs (temperature/num_ctx/seed unchanged).

## Stage 3

5. **κ on single-category answers** — computed over the fixed 8 classes
   (matur, nattura, samfelag, sidir, hugarfar, tunga, vedur, annad), including
   rows/columns that are all zero. Confidence = Clef's `confidence` field on
   the `category` answer.

## Stage 4

6. **Pools use Samtal (truth) categories, not Clef's `category` answer.** The
   spec writes "Pool: Íslenskast `vedur`" etc. using the data's own category
   keys; eligibility says "Samtal category ≠ annad". A multi-category answer
   joins every pool its truth set covers; the earlier movement wins (spec
   rule).
7. **Movement 1 "All eligible, max 8"** — when more than 8 are eligible, the
   top 8 by composite are taken (same selection basis as movements 2/4/5).
8. **Bridge ordering** — "that concept's eligible answers, max 5, in data
   order" and the general rule "movements 1, 2, 4, 5 and the bridge:
   first = argmax opener, last = argmax closer …" partially conflict. Read as:
   *selection* is in data order (first 5 eligible), then the general
   opener/closer/composite/tone ordering applies, since the ordering rule
   explicitly lists the bridge.
9. **Refrain shape** — "top 4 eligible `nattura` answers … sung as one 2-line
   refrain" is read as two lines of two answers each, joined `", "` (the same
   joining mechanism as movement-6's chanted lines and the place-prefix rule).
   Refrain line `seconds` = sum of the two answers' expected seconds; EN gloss
   joined `"; "`; `composite`/`tone` null (they live on `parts[]`). An odd
   leftover would form a one-answer refrain line (does not occur here).
10. **Movement-3 cap** — 8 populated sectors × top 2 = ≤16 naturally. If a
    ninth sector were populated (>16 lines), the lowest-composite sector
    winners would be dropped to reach 16 (not hit on this snapshot).
11. **Seconds for topic/tagline lines** — movement-6 lines have no Clef
    `seconds` question, so `seconds`/`composite`/`tone` are null and each such
    line contributes the 4500 ms floor to its chunk duration
    (`max(4500, 1200·s)` with no `s` → 4500).
12. **Chunk split** — consecutive groups of ≤10 sung lines (not balanced).
    Movement 4's bridge always starts a fresh chunk so the bridge chunk keeps
    the spec's distinct bridge styles (the general rule says chunks are
    ≤10 lines; nothing forbids a section boundary also being a chunk
    boundary). Chunk titles: movement title IS; the bridge chunk uses
    "Skuggahliðarnar".
13. **Place lyric text** — `placeDisplay + ". " + sungSentence` where
    `placeDisplay` is the text before the first comma (municipality for the
    digit place, which is never sung anyway), and `sungSentence` is the whole
    reason if ≤140 chars / the excerpted sentence otherwise. `source` is
    `place:<id>` with `url` `https://talasaman.is/stadir?stadur=<id>`.
14. **`source` for multi-concept answers** — `islenskast:` + all concepts the
    answer appears under, comma-joined in data order (33 answers span >1
    concept). The `concepts` array is also on each line.
15. **Tone round-robin** — implemented greedily: middle lines grouped by tone
    (composite order within), repeatedly take from the largest remaining group
    whose tone differs from the previous sung line (opener counts); fall back
    to any group when avoidance is impossible; final pass swaps a middle line
    into last position if the closer's tone would otherwise collide.
16. **`rerun` is non-destructive** — re-called responses are written to
    `runs/<id>/recall-<model>-<sha>.json` plus `rerun-<model>-diff.json` in
    the same run dir; the replay cache is not modified, so `vp run build`
    stays byte-stable. `--limit N` (extra, spec-neutral flag) recalls only
    the first N cached requests for quicker checks. Diffing compares the
    semantic payload only (clef `answers` / granite `message.content`);
    Ollama timing fields differ on every call and are ignored.
17. **Two implementation bugs found and fixed before the deliverable run**
    (noted here for honesty, not deviations): gloss lookup key separator
    (stage 2 `kind is` vs stage 4 `kind is` space — unified on space) and
    duplicate object identity for the second refrain occurrence (cloned so
    line numbering is per-position).

## Output conventions

- `out/` artifacts contain no timestamps or hostnames (byte-identical replay
  gate). Run metadata lives only under `runs/`.
- Cache: `cache/<model>/<sha256-of-request-body>.json` = `{request, response}`.
- Every model call (including cache hits) is appended to
  `runs/<run-id>/<model>.jsonl` with sha, latency and timestamps.

## Amendment A + stages 5–7 (phase 2/3 pass)

18. **A1 bounding box is literal** — three places fall outside
    63.0–66.7N / −24.6–−13.4W, not the one the amendment prose implies:
    `중성동, 평양시` (Pyongyang coords), `京都御所, 上京区` (Kyoto coords),
    and `Breiðamerkursandur, Sveitarfélagið Hornafjörður` (lat 62.54, an
    Icelandic place caught by the literal rule). All three are excluded
    from lyrics/map/video and counted in the report under
    "utan Íslands / outside Iceland". 23 exclusions total (was 20).
19. **A2/A3 ordering** — popularity-floor and title lines are forced into
    the movement pool first (cap grows); normal Clef ordering then applies,
    with the title line pinned as closer in `arrangeLines`.
    "Þetta reddast" satisfies both rules: overrides.json carries both
    `include_popularity` and `title_closer` entries for it; the inspector
    shows the title reason (the more salient of the two).
20. **Retry options shared** — `GRANITE_RETRY_OPTIONS` (the spec's named
    retry set) is also passed to Gemma's gloss calls; the spec defines one
    retry rule for both bake-off models, so the constant name is retained
    rather than duplicated.
21. **A5 normalization** — `sung` = lowercased? No — spec says only emoji
    removal, quote-char removal, whitespace collapse; case is preserved.
    `sung` drives ElevenLabs input and Scribe matching; `text` stays
    byte-verbatim everywhere user-visible. The verbatim gate checks `text`.
22. **ElevenLabs request sha** — Scribe's multipart body uses a fixed
    boundary (`samhljomurBoundary0x1`) so request hashes are deterministic
    and cacheable. Auth header is masked (`***`) before hashing/logging;
    the key never enters `runs/`, `out/`, `site/` or this file.
23. **Take selection** — seeds 1010, 463, 2026 all generated; Scribe v2
    scored them (0.689 / 0.744 / 0.650); best = 0.744 (seed 463) ≥ 0.45 so
    extra seeds 4/5 were not requested. Line fidelity = LCS-matched
    expected sung words / expected words inside each chunk's plan window;
    unmatched lines spread evenly across the enclosing gap. `words`
    filtered to `type:"word"` (spacing/audio events dropped).
24. **mp4 render** — `site/medley.mp4` is produced by stepping
    `renderAt(t)` at 30 fps under Playwright/Chromium **run through bun**
    (the node fallback the spec allows was not needed) piping canvas PNGs
    to ffmpeg (`-c:v libx264 -crf 20 -pix_fmt yuv420p`, audio = chosen take,
    `-shortest`). `body.rendering` hides chrome; `window.__t` carries the
    stepped time so the page stays a normal player otherwise.
25. **Playwright browser** — playwright@1.63 needed
    `bunx playwright install chromium` (chromium_headless_shell-1243);
    added to package.json devDeps (`world-atlas`, `topojson-client` also
    added for the coastline). Font woff2 files and the Iceland outline are
    committed under `assets/` so builds stay offline.
26. **Extra authored IS strings** — a handful of UI strings not yet in
    copy/strings.json (e.g. "Ritstjórnarákvarðanir", "sungnar línur",
    "söngliður") are machine-drafted and flagged: they are enumerated in
    gates.ts `extra[]` so the `natural_is` gate scores them; the lead can
    promote them into strings.json verbatim.
27. **Songbook language toggle** — in-page toggle hides the IS/EN member of
    each bilingual span (both are always in the DOM for the coverage gate).
    PDF is generated in IS mode (default class).

## Rework pass (post phase-2/3 review)

28. **Lyric display rule (lead-authored)** — per chunk, line i is shown from
    `start_i − 0.4 s` to `min(start_{i+1} − 0.15 s, start_i + max(sungSpan_i,
    clefSeconds_i) + 1.5 s)`; last line of a chunk may hold to the chunk end;
    topics/tagline lines (no Clef seconds) use 4.5 s. Movement title card
    (IS large + EN small) shows during each chunk's lead-in. New coverage:
    lyrics on screen ~82% of runtime, ~92% including title cards
    (`qa/coverage.json`).
29. **English-only elements** (lead instruction: English where no IS string
    was supplied): `hidden_label` ("hidden" masks privacy-excluded rows),
    `sec_snapshot` ("Snapshot (sha256)"), `all_themes` ("all"), table
    headers model/seed/score/min line/action/n. New strings added to
    `copy/strings.json` that need lead eyes: `sec_sung` ("Sungnar línur" —
    mechanical capitalization of the approved "sungnar línur") and
    `col_islang` ("Íslenska" — language name, proper noun).
30. **`is_strings` gate** — proves "no Icelandic outside strings.json":
    scans visible text nodes of every `site/*.html` and flags any node with
    IS diacritics or common IS function words that is neither a strings.json
    `is` value nor verbatim participant data. Heuristic: unaccented
    Icelandic words could slip through (`qa/is-strings.txt`).
31. **Verbatim display in m2** — falling items are whole Íslenskast answers
    (never word fragments); count scales the font.
32. **m4 presentation** — Iceland outline fades out for the movement; yoke
    is perfect concentric circles (oatmeal/charcoal/white/red colourwork:
    diamonds, zigzag, eight-point stars, dots), built stitch-by-stitch from
    the neck outward; the bridge desaturates to grey.
33. **publish.sh** — written but not run. Creates `audreyt/samhljomur`
    (public), pushes main, enables Pages via
    `.github/workflows/pages.yml` deploying `site/`. `cache/`, `runs/`,
    `qa/`, `media/` are committed so a clone replays offline; only
    `node_modules/` and `.DS_Store` are ignored. Largest file:
    `site/medley.mp4` ≈ 50 MB (under the 95 MB check).
34. **natural_is is informational only** — Clef scored even Atli's own
    verbatim Icelandic questions under 0.70, so it is not a grammar check;
    `qa/natural-is.json` says so and no page claims it as a check.

## Amendment B (third translator, Apertus 1.5 8B)

35. **B2 config table** — `TRANSLATORS` in `src/spec.ts` (id, name, api,
    url, model, options, retry_options). Apertus 70B joins as one entry on
    the same `openai-chat` api (port 8004) + one id in `TIE_ORDER`.
36. **Latency in cache entries** — `cache/<model>/<sha>.json` now carries
    `latency_ms`; granite/gemma entries were backfilled from the original
    live-run logs (`runs/20261004233938-oo0m`, `runs/20261005002923-m3nt`)
    so bake-off median latency is deterministic under replay. Four cache
    entries had no logged latency (0 used — recall-log entries).
37. **Selection (B3)** — eligible = within 0.05 of best faithful, first in
    TIE_ORDER (gemma > apertus70 > apertus > granite); reproduces the A6
    "prefer Gemma" rule exactly and extends to new translators.
38. **Apertus quirks** — `chat_template_kwargs.enable_thinking:false` per
    lead probe; some glosses append bracketed word glosses (allowed by the
    system prompt). Apertus won 47 items; note its "pylsa" -> "sausage",
    "kókómjólk" -> "coconut milk" renderings are literal but idiomatically
    wrong where Clef still scored them highest — selection follows Clef.
39. **Old manifests untouched** — proof_of_place was added to the original
    judge-run manifest once, as recorded; new runs record translator
    endpoints in `models` automatically.

## Amendment C (Clef faithful demoted to display-only)

40. **C2 selection** — chosen = Gemma always, edits override; all three
    candidates + Clef scores stay in `glosses.json` and the report table.
    `TIE_ORDER` kept (unused for selection now; governs only if a future
    amendment re-enables score-based choice).
41. **C3 unverified removed** — field, `[UNVERIFIED]` marks, the
    `gloss_unverified` label uses, and `qa/unverified-glosses.txt` deleted.
    `gloss_unverified` string key left in strings.json (lead-authored; now
    unreferenced).
42. **Scorecard answers** — the `a_yes/a_partly/a_no` keys were defined but
    never rendered; cells now show the answer badge + text. My assignments
    beyond the lead's C4 (glosses Q2 = að hluta): judgments = fyrir×3,
    glosses = fyrir/hluta/fyrir, music = að hluta×3 (vendor known, internals
    not; conditions via ElevenLabs terms; switching means regenerating).
    Flagging for lead confirmation.

## Amendment C (Clef faithful demoted from judge to score)

40. **C2** — `glossOne` now always picks `cands.gemma` (edits still
    override). TIE_ORDER kept for the day a different default is wanted.
    All candidates + Clef scores remain in glosses.json and the report.
41. **C3** — `unverified`/`óstaðfest` removed from GlossEntry, stage4 line
    glosses, lyrics.txt, songbook/report badges, video lyric label and
    inspector. `qa/unverified-glosses.txt` deleted. The unused
    `gloss_unverified` key remains in strings.json (lead file) but renders
    nowhere.
42. **C4 scorecard** — cells now show the answer badge
    (Liggur fyrir / Að hluta / Liggur ekki fyrir) + text. My answer map:
    judgments all Liggur fyrir; glosses [fyrir, Að hluta, fyrir];
    music all Að hluta. Lead should confirm the nine answers.
43. **Gemma digest** recorded in run manifests: `e0812a55773b` (Apache-2.0).
44. **Apertus kept as a candidate** — its `openai-chat` config stays in
    `TRANSLATORS`; Apertus 70B lands on port 8004 with one table row.
