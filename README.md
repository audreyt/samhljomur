# Samhljómur

*Íslandsmedley úr opnum gögnum Samtals. Orð þátttakenda, orðrétt. Clef valdi línurnar og raðaði þeim. Þetta er hvorki afstaða né niðurstaða Samtals.*

An Iceland medley built from [Samtal](https://talasaman.is)'s open
conversation data (CC BY 4.0). Participants' Icelandic words are sung
verbatim. Two open-weight models do all the analysis, on a laptop in
Reykjavík: Clef (a System One decision model) classified, scored, selected,
ordered and timed every line, and Gemma 4 31B wrote the English glosses,
with editorial corrections listed in `copy/gloss-edits.json`. Granite 4.2
30B and Apertus 1.5 8B were tried as translators and are kept for
comparison in `out/gloss-bakeoff.md`; Clef's fidelity scores are shown
there but do not choose, because Clef proved a poor judge of translation.
ElevenLabs Music v2.5 made the singing and Scribe v2 aligned every line to
the audio.

**[Watch / read the artifacts](https://audreyt.github.io/samhljomur/)**:
`site/` contains the video player (`video.html`, `medley.mp4`), the
report (`report.html`), the printable songbook (`songbook.html` /
`songbook.pdf`) and a poster frame.

## Layout

- `data/snapshot-20261004/` (the CC BY 4.0 snapshot all outputs derive from)
- `copy/strings.json` (every authored UI string, IS/EN); `copy/gloss-edits.json` (editorial gloss overrides)
- `out/`: judgments, glosses, calibration, lyrics, overrides, timeline
- `runs/<run-id>/` (every model request/response with request sha256)
- `cache/<model>/<sha>.json` (replay cache; ElevenLabs bodies live in `media/takes/`)
- `site/` (the deliverable)
- `qa/` (verification evidence: gates, screenshots, frames)
- `SPEC.md`: the fixed spec; `DEVIATIONS.md` (every judgment call)

## Replay

Requires [bun](https://bun.sh). Everything replays offline from cache:

```bash
vp run judge    # stages 1-3: Clef judgments, Gemma glosses (+ bake-off candidates), calibration
vp run arrange  # stage 4: out/lyrics.json
vp run music    # stages 5-6: ElevenLabs takes + Scribe alignment (needs ELEVENLABS_API_KEY; replays cached otherwise)
vp run site     # stage 7: site/ incl. medley.mp4
vp run build    # all of the above, offline, from cache
vp run verify   # QA gates -> qa/
vp run rerun -- --model clef   # re-call a model and diff
```

`vp run build` on a fresh clone reproduces `out/lyrics.json` and
`out/timeline.json` byte-for-byte.

Replay needs no models or network. A live `vp run judge` needs Ollama with
`clef` + `gemma4:31b-it-qat-google-official`; the bake-off candidates only
if you want to re-run them (`granite4.2:30b` via Ollama, Apertus 8B via
`mlx_lm.server` on :8003).

## Credits

Made by Devin (Audrey's AI assistant) for Finnur Magnússon and Atli Þór
Jóhannsson. Words: Samtal participants. Music: generated via ElevenLabs.

## Licences

- Code: MIT
- Samtal data (snapshot, participant texts): CC BY 4.0, © Samtal félag til almannaheilla
- Music: generated with ElevenLabs Music v2.5 (ElevenLabs terms apply; not for redistribution as stock audio)
- Fonts: Fraunces and Inter, both SIL Open Font License
