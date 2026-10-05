// Stage 7: build site/ artifacts (video, report, songbook, index, standalone,
// poster, medley.mp4). Loads all out/*.json products.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { RunCtx } from "./model";
import { Stage4Out } from "./stage4";
import { Timeline } from "./stage6";
import { videoHtml } from "./site-video";
import { reportHtml } from "./site-report";
import { songbookHtml } from "./site-songbook";
import { indexHtml } from "./site-index";
import { renderMp4, withPage, frameAt } from "./render";
import { chromium } from "playwright";

export async function stage7(ctx: RunCtx) {
  mkdirSync("site", { recursive: true });
  mkdirSync("site/media", { recursive: true });
  const lyrics = JSON.parse(readFileSync("out/lyrics.json", "utf8")) as unknown as Stage4Out;
  const j = JSON.parse(readFileSync("out/judgments.json", "utf8"));
  const g = JSON.parse(readFileSync("out/glosses.json", "utf8"));
  const cal = JSON.parse(readFileSync("out/calibration.json", "utf8"));
  const tl = JSON.parse(readFileSync("out/timeline.json", "utf8")) as Timeline;
  const bakeoff = JSON.parse(readFileSync("out/gloss-bakeoff.json", "utf8"));
  const exclusions = JSON.parse(readFileSync("out/exclusions.json", "utf8"));
  const overrides = JSON.parse(readFileSync("out/overrides.json", "utf8"));

  // chosen audio
  const haveAudio = tl.chosen_file && existsSync(tl.chosen_file);
  if (haveAudio) copyFileSync(tl.chosen_file!, "site/media/medley.mp3");

  // digests for the replay section
  const digests: Record<string, string> = {};
  try {
    const tags = JSON.parse(
      execFileSync("curl", ["-s", "http://127.0.0.1:11434/api/tags"], {
        timeout: 8000,
      }).toString(),
    );
    for (const m of tags.models ?? []) digests[m.name] = m.digest;
  } catch {
    // offline replay: digests from spec constants
    digests["clef:latest"] = "sha256:2bb11a61d1fb…(spec)";
    digests["granite4.2:30b"] = "sha256:be22829aa92a…(spec)";
    digests["gemma4:31b-it-qat-google-official"] = "local";
  }
  const snapshot: Record<string, string> = {};
  for (const f of ["islenskast", "places", "topics", "circles", "stats", "openapi"]) {
    const b = readFileSync(`data/snapshot-20261004/${f}.json`);
    snapshot[`${f}.json`] = createHash("sha256").update(b).digest("hex");
  }

  const vh = videoHtml(lyrics, tl);
  const videoChanged =
    !existsSync("site/video.html") ||
    readFileSync("site/video.html", "utf8") !== vh;
  writeFileSync("site/video.html", vh);
  writeFileSync(
    "site/report.html",
    reportHtml(j, g, lyrics, exclusions, overrides, cal, tl, bakeoff, { snapshot, digests }),
  );
  writeFileSync("site/songbook.html", songbookHtml(lyrics));

  // poster frame: midpoint of movement 5 (aurora bloom)
  const m5 = tl.chunks.filter((c) => c.movement === 5);
  const tPoster = m5.length
    ? (m5[0].start_s + m5[m5.length - 1].end_s) / 2
    : tl.total_duration_s / 2;
  await withPage("file://" + path.resolve("site/video.html"), async (page) => {
    const png = await frameAt(page, tPoster);
    writeFileSync("site/poster.png", png);
    const png2 = await frameAt(page, m5.length ? m5[0].start_s + 8 : 10);
    writeFileSync("site/poster-alt.png", png2);
  });
  writeFileSync("site/index.html", indexHtml());

  // medley.mp4 — deterministic from video.html; skip when nothing changed
  if (haveAudio && (videoChanged || !existsSync("site/medley.mp4"))) {
    await renderMp4({
      htmlPath: "site/video.html",
      audioPath: "site/media/medley.mp3",
      outPath: "site/medley.mp4",
      durationS: tl.total_duration_s,
      onProgress: (i, tot) =>
        console.log(`[mp4] frame ${i}/${tot} (${((i / tot) * 100).toFixed(0)}%)`),
    });
  } else if (haveAudio) {
    console.log("[stage7] video.html unchanged — medley.mp4 kept");
  } else {
    console.warn("[stage7] no audio take — skipping medley.mp4");
  }

  // video-standalone.html with inlined audio
  if (haveAudio) {
    writeFileSync(
      "site/video-standalone.html",
      videoHtml(lyrics, tl, { standalone: true }),
    );
  }

  // songbook.pdf via playwright print
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto("file://" + path.resolve("site/songbook.html"));
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: "site/songbook.pdf",
      width: "148mm",
      height: "210mm",
      printBackground: true,
    });
  } finally {
    await browser.close();
  }
  console.log("[stage7] site/ written");
}
