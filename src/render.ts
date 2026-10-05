// Playwright helpers: frame-stepping renderer for medley.mp4, poster frames,
// page screenshots and A5 PDF export.

import { chromium } from "playwright";
import { createWriteStream, writeFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

export async function withPage<T>(
  url: string,
  fn: (page: import("playwright").Page) => Promise<T>,
  viewport = { width: 1920, height: 1080 },
): Promise<T> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport });
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    const out = await fn(page);
    if (errors.length) console.error("console errors:", errors.slice(0, 5));
    return out;
  } finally {
    await browser.close();
  }
}

export async function frameAt(
  page: import("playwright").Page,
  t: number,
): Promise<Buffer> {
  return page.evaluate(async (tt) => {
    (window as any).__t = tt;
    document.body.classList.add("rendering");
    (window as any).renderAt(tt);
    const cv = document.getElementById("cv") as HTMLCanvasElement;
    return cv.toDataURL("image/png");
  }, t).then((d) => Buffer.from((d as string).split(",")[1], "base64"));
}

// Render medley.mp4 by stepping renderAt(t) at fps, piping PNGs into ffmpeg.
export async function renderMp4(opts: {
  htmlPath: string;
  audioPath: string;
  outPath: string;
  durationS: number;
  fps?: number;
  onProgress?: (i: number, total: number) => void;
}): Promise<void> {
  const fps = opts.fps ?? 30;
  const total = Math.round(opts.durationS * fps);
  const ff = spawn("ffmpeg", [
    "-y",
    "-f", "image2pipe",
    "-framerate", String(fps),
    "-i", "-",
    "-i", opts.audioPath,
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    "-movflags", "+faststart",
    opts.outPath,
  ]);
  ff.stderr.on("data", () => {});
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto("file://" + path.resolve(opts.htmlPath));
    await page.evaluate(() => document.fonts.ready);
    for (let i = 0; i < total; i++) {
      const png = await frameAt(page, i / fps);
      if (!ff.stdin.write(png)) {
        await new Promise((r) => ff.stdin.once("drain", r));
      }
      if (opts.onProgress && i % 300 === 0) opts.onProgress(i, total);
    }
  } finally {
    await browser.close();
  }
  await new Promise<void>((res, rej) => {
    ff.stdin.end();
    ff.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exit ${c}`))));
    ff.on("error", rej);
  });
}

export async function screenshotAll(opts: {
  pages: string[]; // file paths
  widths: number[];
  langs: ("is" | "en" | "zh")[];
  outDir: string;
}) {
  mkdirSync(opts.outDir, { recursive: true });
  const browser = await chromium.launch();
  const errs: string[] = [];
  try {
    for (const p of opts.pages) {
      for (const w of opts.widths) {
        for (const lang of opts.langs) {
          const page = await browser.newPage({
            viewport: { width: w, height: Math.round((w * 9) / 16) + 400 },
          });
          const errors: string[] = [];
          page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
          page.on("pageerror", (e) => errors.push(String(e)));
          await page.goto("file://" + path.resolve(p));
          if (lang !== "is")
            await page.evaluate((l) => {
              const fn = (globalThis as any).setVlang ?? (globalThis as any).setLang;
              fn?.(l);
            }, lang);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(350);
          const name = `${path.basename(p, ".html")}-${w}-${lang}.png`;
          await page.screenshot({
            path: `${opts.outDir}/${name}`,
            fullPage: true,
          });
          errs.push(...errors.map((e) => `${name}: ${e}`));
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  return errs;
}
