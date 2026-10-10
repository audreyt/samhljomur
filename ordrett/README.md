# Orðrétt

The front page of [audreyt.github.io/samhljomur](https://audreyt.github.io/samhljomur/):
every table summary from Samtal on 10 October 2026, as Samtal published it,
with the recordings the tables chose to share. Built into `site/index.html`;
the record of why it replaced the medley is `site/saga.html`.

Nothing on the page is generated. No model wrote, translated, shortened or
voiced anything from the tables; what is shown, and in what order, follows
rules the page states. An AI assistant helped draft those rules and the code,
and the page says so. The parts:

- **The voices.** One line per audible recording, drawn from its own sound:
  loudness every 50 ms, lightly smoothed, scaled to its own peak, width
  proportional to its length. Shortest on top, longest at the base, all
  centred, so the stack forms a mountain. *Ein í einu* plays them in
  postcode order (7:47). *Allar í einu* plays them as drawn: each voice
  centred on the same moment, so the longest starts alone, the others join
  as the sweep reaches them, and the longest ends alone (1:13). Playback
  levels every voice to the same speaking level (−20 dBFS, within ±9 dB).
- **Við viljum.** Every sentence from the tables with the word „viljum“, set
  on one spine under Samtal's own question. A sentence is text between line
  breaks or sentence-ending punctuation; a list mark at the start of a line
  is layout, not words.
- **Gervigreind.** Every summary with the AI topic or the word itself, on a
  paper sheet with five highlighters. Each highlighter marks words that
  begin with the stems printed on it; readers switch them on and off. Which
  stems get a colour is the page's editorial choice, and the sheet says so.
- **Öll borðin.** Every summary, by postcode, then location, then table.
  Each colour is a postcode; Iceland's postcodes, and so the colours, run
  round the island. Any summary becomes a 1080 × 1920 poster to share.
- **Live, with the recordings streamed.** On load the page fetches
  `/api/v1/summaries` from talasaman.is and plays each recording from its
  talasaman.is URL; recordings are never copied here. The text is also
  embedded as a dated snapshot (and kept in `ordrett/data/`) so the page
  works when talasaman.is cannot be reached. A summary Samtal later removes
  therefore stays in this page's source until the next build, and in git
  history.
- **Screen mode** for a hall: `#skjar`, or *Sýna á skjá* at the foot.

## Build and check

```bash
bun ordrett/build.ts --fetch   # new snapshot; measure every recording with ffmpeg
bun ordrett/build.ts           # rebuild site/index.html and site/saga.html
bun ordrett/verify.ts          # gates in headless Chromium -> ordrett/qa/gates.txt
```

`--fetch` downloads the recordings to a temporary directory only to measure
them (length, loudness envelope, typical speaking level, silence below
−60 dB), then deletes them. Three recordings from Tækniskólinn, table 1,
are silent and are marked as such.

The gates check every summary, „viljum“ sentence and AI summary character
for character against the data; the stated order; that only talasaman.is is
contacted; one voice and all voices playing; the poster size; screen mode;
the page under talasaman.is's own Content-Security-Policy; that every old
medley address still answers; and that the medley's front page is kept
byte for byte.

## Licences

- Code: MIT
- Data: Gögn: Samtal, félag til almannaheilla (talasaman.is), CC BY 4.0.
  Recordings are not redistributed; the page plays them from talasaman.is.
- Fonts: Atkinson Hyperlegible Next and Schibsted Grotesk, SIL Open Font
  License 1.1
