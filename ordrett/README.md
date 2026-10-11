# Orðrétt

The front page of [audreyt.github.io/samhljomur](https://audreyt.github.io/samhljomur/):
every table summary from Samtal on 10 October 2026, as Samtal published it,
with the recordings the tables chose to share. Built into `site/index.html`;
the record of why it replaced the medley is `site/saga.html`.

Nothing from the tables is written, shortened or voiced by a model; what is
shown, and in what order, follows rules the page states. In Icelandic nothing
is translated either. In English and Chinese an AI assistant has translated
the tables' words beforehand (`data/translations.json`), the page says so,
and the Icelandic stays beside every translation. An AI assistant also
helped draft the rules and the code, and the page says so. The parts:

- **The voices.** One line per audible recording, drawn from its own sound:
  loudness every 50 ms, lightly smoothed, scaled to its own peak, width
  proportional to its length. Shortest on top, longest at the base, all
  centred, so the stack forms a mountain. *Ein í einu* plays them in
  postcode order (7:47). *Allar í einu* plays them as drawn: each voice
  centred on the same moment, so the longest starts alone, the others join
  as the sweep reaches them, and the longest ends alone (1:13 in this
  snapshot; a longer recording fetched live lengthens the sweep). Playback
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
  The words are set at the largest size that fits with no word cut in
  two. A summary that would fall below 36px goes on as few frames as keep
  it at 36px or larger, split between lines, at the end of a paragraph
  when one is near; the frames are shared and saved together. A summary
  with a recording is set in the shape of that recording when that keeps
  its words at 36px or larger: top to bottom is start to end, and each
  line is as wide as the voice is loud in its stretch (the mean reading
  there, scaled from the recording's quietest stretch to its loudest, 40%
  of the measure to all of it). The rule is printed on the poster.
  A search field finds a word, or part of one, in a summary, its place or
  its topic, and marks it; the words themselves are untouched.
- **Live, with the recordings streamed.** On load the page fetches
  `/api/v1/summaries` from talasaman.is and plays each recording from its
  talasaman.is URL; recordings are never copied here. The text is also
  embedded as a dated snapshot (and kept in `ordrett/data/`) so the page
  works when talasaman.is cannot be reached. A summary Samtal later removes
  therefore stays in this page's source until the next build, and in git
  history. If the live summaries are the snapshot's, only the date line
  changes; if not, the page redraws and keeps the reader's place.
- **Screen mode** for a hall: `#skjar`, or *Sýna á skjá* at the foot.
  The arrow keys turn the page and Space pauses; buttons at the foot do the
  same by mouse or touch, and they and the pointer sleep while the words
  are read. A summary written as a long list is set in columns on a wide
  screen when that makes its words larger and it then fits whole; on a
  phone, a summary too long for the screen scrolls in its frame. The size
  is worked out from the lines before the words are set, and the page is
  measured once to confirm it.
- **The mountain on a hall screen:** `#fjall`, or *Sýna fjallið*. The
  mountain fills the screen and plays every voice at once, then each
  voice in turn. While a voice is heard, its summary is shown and the
  word follows the loudness in the recording, when that reading fits a
  spoken pace; otherwise the words stand whole. A recording that arrives
  after the build is measured from the file itself and its line joins
  the mountain.
- **On paper.** Printing gives black on white: the title, the „viljum“
  spine, the AI sheet with its highlighter colours, and every summary,
  with no players or controls.
- **In Icelandic, English or Chinese.** The page's own words come in
  Icelandic, British English (`#en-gb`) and Taiwanese Mandarin
  (`#zh-tw`). What the tables wrote, their places and topics, Samtal's
  question and its attribution line stay as written and are marked as
  Icelandic, so a screen reader says them as Icelandic. Samtal's question
  keeps its own words, with its meaning beneath.
- **The tables' words, translated, in English and Chinese.** An AI
  assistant translated every summary, and every sentence the page sets on
  its own, into British English and Taiwanese Mandarin beforehand. They
  are `ordrett/data/translations.json`, inlined by the build, so the page
  sends nothing anywhere to translate and works under talasaman.is's own
  Content-Security-Policy. No person has checked them, and the page says so.
  Where a summary is read (the list of all the tables, the line under the
  mountain, screen mode) the translation stands in its place, marked as
  English or Chinese, and *Icelandic original* under each opens the summary
  as written. On the „viljum“ spine and the AI sheet, whose words are
  Icelandic, the Icelandic stays and the translation stands beneath; on the
  mountain full screen the Icelandic words follow the voice, with the
  translation alongside. Search reads both, and a match only the Icelandic
  holds opens it. Printing gives both. Posters keep the tables' words as
  written. A summary the file has no translation for, such as one that
  arrives after the build, stays in Icelandic and the page says so; the
  build lists such summaries, and `translations.json` takes the new entries
  (each is `is`, `en-GB`, `zh-TW`, with the Icelandic's lines and list
  marks kept).
- **Choosing the language.** The language is the one the address names, which is then
  remembered; else the one chosen before; else the browser's: Icelandic
  if it lists Icelandic at all, otherwise the first of English or Chinese
  it lists, otherwise English. Chinese is set in the reader's Traditional
  Chinese sans. The record page, `saga.html`, comes in the same three
  languages, chosen the same way and remembered with the front page's
  choice. See [`L10N.md`](L10N.md).

Posters and screen mode lay out their lines with
[Pretext](https://github.com/chenglou/pretext), which breaks lines the way
the browser does by arithmetic over widths the browser's own canvas
measures. Each text is measured once; trying another size costs no
measuring and no reflow. It is bundled from `node_modules` and inlined by
the build, so the page still loads nothing but talasaman.is. A browser
without `Intl.Segmenter` cannot run it, and there the page measures as it
did before.

A contents line at the top links *Við viljum*, *Gervigreind*, *Öll borðin*
and *Um síðuna*. A link to one summary (`#e-<id>`, as the spine uses)
lands on it and marks it. Every poster window offers that same link, and
opening the poster puts it in the address. Closing the poster leaves the
link there.

## Build and check

```bash
bun install                    # Pretext, Playwright
bun ordrett/build.ts --fetch   # new snapshot; measure every recording with ffmpeg
bun ordrett/build.ts           # rebuild site/index.html and site/saga.html
bun ordrett/build.ts --images  # also redraw the share card and the home-screen icon
bun ordrett/verify.ts          # gates in headless Chromium -> ordrett/qa/gates.txt
```

`--fetch` downloads the recordings to a temporary directory only to measure
them (length, loudness envelope, typical speaking level, silence below
−60 dB), then deletes them. Three recordings from Tækniskólinn, table 1,
are silent and are marked as such.

The share card, `site/ordrett-card.png` (1200 × 630), is the page's
mountain under its title, drawn from the same loudness data by the same
rules. The tab and home-screen icon is the ð of the title. Both PNGs are
drawn with Playwright, again with `--fetch` or `--images` or when missing,
so a plain rebuild leaves them byte for byte.

The gates check every summary, „viljum“ sentence and AI summary character
for character against the data; the stated order; that only talasaman.is is
contacted; one voice and all voices playing; the poster size; screen mode;
the page under talasaman.is's own Content-Security-Policy; that every old
medley address still answers; and that the medley's front page is kept
byte for byte. They also check what a reader meets: no sideways scrolling
at 320px or with text at 200%; focus held by the poster and screen mode
and given back; a poster's link to its summary; listen buttons named as they
read; search; print; the
live redraw; the player on a slow connection; screen mode's buttons by
mouse and by touch; long summaries in screen mode on a projector and a
phone; the mountain full screen, with the words following the voice; a
recording measured from its own file; and the share card and icons. And
they check the layout: Pretext counts the lines of every summary as the
page sets them, or one more, never fewer; every poster holds its summary
whole and in order at 36px or larger, a voiced one in the shape of its
voice when that keeps it there; screen mode sets every summary whole on a
projector; and without `Intl.Segmenter` the poster and screen mode work as
before. And the languages: the browser's language chooses, and an address
naming one chooses and is kept; every summary and spine sentence has both
translations, in the Icelandic's lines and list marks; in English and in
Chinese every summary is read in the translation the file holds, marked as
that language, with its Icelandic verbatim beside it and marked Icelandic;
the spine and the AI sheet keep their Icelandic with the translation
beneath; nothing Icelandic is left unmarked; nothing is sent anywhere to
translate; the Icelandic original opens and closes; search finds a word of
either; a summary with no translation stays in Icelandic and the page says
so; a poster's frames are named in the reader's language around the tables'
words, which stay as written; and the record page shows one language,
chosen the same way and kept with the front page's choice. The other gates
read the page in Icelandic.

## Licences

- Code: MIT
- Data: Gögn: Samtal, félag til almannaheilla (talasaman.is), CC BY 4.0.
  Recordings are not redistributed; the page plays them from talasaman.is.
- Fonts: Atkinson Hyperlegible Next and Schibsted Grotesk, SIL Open Font
  License 1.1
- Pretext 0.0.9, inlined in the page: MIT, © 2026 Pretext contributors
