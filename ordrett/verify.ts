// Orðrétt gates, run against site/ in headless Chromium.
//
//   bun ordrett/verify.ts
//
// Content gates run on the embedded snapshot (the live list request is blocked
// so the page is deterministic): every summary character for character, the
// stated order, every "viljum" sentence on the spine, every AI summary on the
// sheet. Live gates then let the page reach talasaman.is: live data, playback
// of one voice and of all voices at once, posters, screen mode, and the page
// under talasaman.is's own Content-Security-Policy. Site gates: the medley's
// old addresses all still answer, and the record page links resolve.
// Screenshots go to ordrett/qa/.

import { chromium, type Page } from "playwright";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const HERE = import.meta.dir;
const SITE = join(HERE, "..", "site");
const QA = join(HERE, "qa");
mkdirSync(QA, { recursive: true });
const snapFile = readdirSync(join(HERE, "data")).filter((f) => f.startsWith("summaries-")).sort().pop()!;
const snap = JSON.parse(readFileSync(join(HERE, "data", snapFile), "utf8"));
const facts = JSON.parse(readFileSync(join(HERE, "data", "audio-facts.json"), "utf8")).facts;

const TYPES: Record<string, string> = { html: "text/html; charset=utf-8", pdf: "application/pdf", png: "image/png", mp4: "video/mp4", mp3: "audio/mpeg" };
const server = Bun.serve({
  port: 0,
  fetch(req) {
    let path = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, "");
    if (!path) path = "index.html";
    const file = join(SITE, path);
    if (!file.startsWith(SITE) || !existsSync(file)) return new Response("not found", { status: 404 });
    return new Response(Bun.file(file), { headers: { "content-type": TYPES[path.split(".").pop()!] ?? "application/octet-stream" } });
  },
});
const BASE = `http://localhost:${server.port}/`;

const results: string[] = [];
let failures = 0;
const gate = (name: string, ok: boolean, detail = "") => {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  if (!ok) failures++;
};

// The page's rules, restated here so the gates check the page against them.
const coll = new Intl.Collator("is");
const ordered = snap.data.map((r: any, i: number) => ({ r, i })).sort((a: any, b: any) =>
  (parseInt(a.r.locationPostCode, 10) - parseInt(b.r.locationPostCode, 10)) ||
  coll.compare(a.r.location, b.r.location) || (a.r.table - b.r.table) || (a.i - b.i)).map((x: any) => x.r);
const sentencesOf = (text: string) => {
  const out: string[] = [];
  for (let line of text.split("\n")) {
    line = line.trim().replace(/^[-*•]\s*/, "");
    if (!line) continue;
    for (const s of line.replace(/([.!?])\s+(?=[A-ZÁÐÉÍÓÚÝÞÆÖ"“„])/g, "$1\u0000").split("\u0000")) if (s.trim()) out.push(s.trim());
  }
  return out;
};
const expectedKwic = ordered.flatMap((r: any) => sentencesOf(r.summary).filter((s) => /(^|[^\p{L}])viljum(?![\p{L}])/iu.test(s)).map((s) => ({ id: r.id, s })));
const AI_RE = /gervigrein|gervidrein|(^|[^\p{L}])A\.?I([^\p{L}]|$)/iu;
const expectedAI = ordered.filter((r: any) => (r.topicChosen && r.topic === "gervigreind") || AI_RE.test(r.summary));
const tables = new Set(snap.data.map((r: any) => r.location + "|" + r.table));
const aiTables = new Set(expectedAI.map((r: any) => r.location + "|" + r.table));
const voiced = snap.data.filter((r: any) => r.audio && facts[r.id] && !facts[r.id].silent);

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

async function open(opts: { width: number; height: number; live: boolean; path?: string }) {
  const ctx = await browser.newContext({ viewport: { width: opts.width, height: opts.height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const hosts = new Set<string>();
  const errors: string[] = [];
  page.on("request", (r) => { const u = new URL(r.url()); if (u.protocol.startsWith("http")) hosts.add(u.host); });
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource.*(blocked|ERR_FAILED)/.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  if (!opts.live) await page.route("**/api/v1/summaries", (route) => route.abort());
  await page.goto(BASE + (opts.path ?? ""));
  await page.waitForFunction(() => /Gögnin eru frá/.test(document.getElementById("fetched")?.textContent ?? ""));
  await page.waitForTimeout(opts.live ? 1800 : 600);
  return { ctx, page, hosts, errors };
}
const shot = (page: Page, name: string, full = false) => page.screenshot({ path: join(QA, name), fullPage: full });
const shotOf = async (page: Page, sel: string, name: string) => { await page.locator(sel).screenshot({ path: join(QA, name) }); };

// ---------- content, on the snapshot, at phone width ----------
{
  const { ctx, page, errors } = await open({ width: 390, height: 844, live: false });
  const shown = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("#list .entry")].map((a) => [a.id.slice(2), a.querySelector(".words")!.textContent!]));
  const byId = new Map(snap.data.map((r: any) => [r.id, r.summary]));
  const differ = shown.filter(([id, t]) => byId.get(id) !== t).length;
  gate("every summary verbatim", shown.length === snap.data.length && differ === 0, `${shown.length} shown, ${differ} differ`);
  gate("order: postcode > location > table > Samtal's order", JSON.stringify(shown.map((x) => x[0])) === JSON.stringify(ordered.map((r: any) => r.id)));

  const kwic = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".krow")].map((row) => ({
    id: row.dataset.id!, s: row.dataset.sentence!, left: row.querySelector(".kl")!.textContent!,
    right: [...row.querySelector(".kr")!.childNodes].filter((n) => !(n instanceof HTMLElement && n.classList.contains("km"))).map((n) => n.textContent).join(""),
  })));
  const kwicOk = kwic.length === expectedKwic.length && kwic.every((k, i) =>
    k.id === expectedKwic[i].id && k.s === expectedKwic[i].s && byId.get(k.id)!.includes(k.s) &&
    (k.left ? k.s === k.left + k.s.slice(k.left.length, k.s.length - k.right.length) + k.right && /^\s*$/.test(k.s.slice(k.left.length, k.s.length - k.right.length).replace(/viljum/i, "")) : k.s === k.right));
  gate("viljum: every sentence, whole, from its own summary, in order", kwicOk, `${kwic.length} rows, ${expectedKwic.length} expected`);

  const notes = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".note-row")].map((n) => [n.id.slice(3), n.querySelector(".t")!.textContent!]));
  const notesOk = notes.length === expectedAI.length && notes.every(([id, t], i) => id === expectedAI[i].id && t === expectedAI[i].summary);
  gate("AI sheet: every AI summary verbatim, highlights add no text", notesOk, `${notes.length} shown, ${expectedAI.length} expected`);
  const stat = await page.textContent("#aiStat");
  gate("AI sheet: table count, of the tables in the open data", stat === `${aiTables.size} af þeim ${tables.size} borðum sem eru komin í opnu gögnin töluðu um gervigreind.`, stat ?? "");
  const line = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("#aiLine .s")].map((p) => ({
    id: p.dataset.id!, s: p.dataset.sentence!, shown: [...p.childNodes].filter((n) => !(n instanceof HTMLElement && n.classList.contains("m"))).map((n) => n.textContent).join(""),
    marks: [...p.querySelectorAll("mark")].map((m) => m.className),
  })));
  gate("AI sheet: the line sentences are whole, from their own summaries, each with both colours", line.length > 0 &&
    line.every((l) => l.shown === l.s && (byId.get(l.id) as string).includes(l.s) && l.marks.includes("f2") && l.marks.includes("f4")), `${line.length} sentences`);

  const mtn = await page.evaluate(() => {
    const c = document.getElementById("mtn") as HTMLCanvasElement;
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 120) lit++;
    return { h: c.clientHeight, lit, label: c.getAttribute("aria-label") };
  });
  gate("mountain drawn, one line per audible recording", mtn.h > 150 && mtn.lit > 2000 && (mtn.label ?? "").startsWith(`${voiced.length} `), JSON.stringify(mtn));
  const listen = page.locator("#list .listen");
  const spoken: string[] = [];
  for (let i = 0; i < await listen.count(); i++) {
    const [snapshot, len] = [await listen.nth(i).ariaSnapshot(), await listen.nth(i).locator(".len").textContent()];
    const name = /button "(.*)"/.exec(snapshot)?.[1] ?? "";
    if (!/^Hlusta: .+, borð \d+, /.test(name) || !name.endsWith(`, ${len}`)) spoken.push(snapshot);
  }
  gate("listen buttons: the spoken name names the table and ends with the visible length", (await listen.count()) === voiced.length && spoken.length === 0, spoken.join(" | "));
  const silentMarks = await page.$$eval(".aside", (els) => els.filter((e) => e.textContent === "Upptakan er hljóðlaus.").length);
  gate("silent recordings marked, not playable", silentMarks === Object.values(facts).filter((f: any) => f.silent).length, String(silentMarks));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  gate("no horizontal scroll at 390px", overflow <= 0, `${overflow}px`);
  gate("no errors on the snapshot", errors.length === 0, errors.join(" | "));
  await shot(page, "phone-hero.png");
  await page.locator("#viljum").scrollIntoViewIfNeeded();
  await shotOf(page, "#viljum", "phone-viljum.png");
  await shotOf(page, ".sheet", "phone-sheet.png");
  await ctx.close();
}

// ---------- live: data, one voice, all voices, posters ----------
{
  const { ctx, page, hosts, errors } = await open({ width: 390, height: 844, live: true });
  const live = await page.textContent("#fetched");
  gate("live data reached", !/Náði ekki/.test(live ?? ""), live ?? "");

  // tap the bottom line of the mountain: the longest recording
  const box = (await page.locator("#mtn").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 14);
  await page.waitForTimeout(2600);
  const one = await page.evaluate(() => ({ deck: !document.getElementById("deck")!.hidden, time: document.getElementById("deckTime")!.textContent, now: document.querySelector("#now .say")?.textContent?.slice(0, 40) }));
  gate("tapping a line plays that voice", one.deck && /^0:0[1-9]/.test(one.time ?? "") && !!one.now, JSON.stringify(one));
  const off = await page.evaluate(() => ["deckToggle", "deckStop"].map((id) => {
    const b = document.getElementById(id)!.getBoundingClientRect(), s = document.querySelector("#" + id + " svg")!.getBoundingClientRect();
    return Math.round(Math.max(Math.abs(s.x + s.width / 2 - b.x - b.width / 2), Math.abs(s.y + s.height / 2 - b.y - b.height / 2)));
  }));
  gate("player icons sit centred in their buttons", off.every((d) => d <= 1), JSON.stringify(off));
  await shot(page, "phone-playing-one.png");
  await page.evaluate(() => (document.getElementById("deckStop") as HTMLButtonElement).click());

  await page.click("#playSwell");
  await page.waitForFunction(() => /raddir tala|rödd talar/.test(document.getElementById("now")!.textContent ?? ""), null, { timeout: 30000 });
  await page.waitForTimeout(21000);
  const swell = await page.evaluate(() => ({ now: document.querySelector("#now .big")?.textContent, time: document.getElementById("deckTime")!.textContent }));
  gate("all at once: voices join as the sweep reaches them", /raddir tala/.test(swell.now ?? "") && /^0:[12]\d \/ 1:13$/.test(swell.time ?? ""), JSON.stringify(swell));
  await shot(page, "phone-swell.png");
  await page.evaluate(() => (document.getElementById("deckStop") as HTMLButtonElement).click());

  await page.click("#list .entry .tool");
  await page.waitForFunction(() => (document.getElementById("shade") as HTMLDialogElement).open && (document.getElementById("posterImg") as HTMLImageElement).naturalWidth > 0);
  const img = await page.evaluate(() => { const i = document.getElementById("posterImg") as HTMLImageElement; return [i.naturalWidth, i.naturalHeight, i.src]; });
  gate("poster is a 1080 x 1920 image", img[0] === 1080 && img[1] === 1920, `${img[0]}x${img[1]}`);
  await shot(page, "phone-poster-preview.png");
  const inside = await page.evaluate(() => document.activeElement?.id);
  await page.keyboard.press("Escape");
  const back = await page.evaluate(() => ({
    open: (document.getElementById("shade") as HTMLDialogElement).open,
    focus: document.activeElement === document.querySelector("#list .entry .tool"),
  }));
  gate("poster preview is a modal dialog: focus goes in, and back to its button on Esc", inside === "posterSave" && !back.open && back.focus, JSON.stringify({ inside, ...back }));
  for (const [n, sel] of [["poster-text.png", '[data-poster]'], ["poster-voice.png", '.entry:has(.listen) [data-poster]']] as const) {
    await page.evaluate(() => (document.getElementById("shade") as HTMLDialogElement).close());
    await page.click(`#list ${sel} >> nth=0`);
    await page.waitForFunction(() => (document.getElementById("shade") as HTMLDialogElement).open && (document.getElementById("posterImg") as HTMLImageElement).complete);
    const b64 = await page.evaluate(async () => {
      const i = document.getElementById("posterImg") as HTMLImageElement;
      const blob = await fetch(i.src).then((r) => r.blob());
      return await new Promise<string>((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });
    });
    writeFileSync(join(QA, n), Buffer.from(b64, "base64"));
  }
  gate("only talasaman.is contacted", [...hosts].every((h) => h === "talasaman.is" || h.startsWith("localhost")), [...hosts].join(", "));
  gate("no errors live", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---------- desktop views ----------
{
  const { ctx, page } = await open({ width: 1440, height: 900, live: false });
  await shot(page, "desktop-hero.png");
  await page.hover("#mtn", { position: { x: 720 - 80, y: 200 } });
  await page.waitForTimeout(200);
  await shot(page, "desktop-hover.png");
  await shotOf(page, "#viljum", "desktop-viljum.png");
  await shotOf(page, ".sheet", "desktop-sheet.png");
  await page.locator("#bord").scrollIntoViewIfNeeded();
  await shot(page, "desktop-archive.png");
  await page.locator("#um").scrollIntoViewIfNeeded();
  await shot(page, "desktop-about.png");
  await ctx.close();
}

// ---------- screen mode on a projector ----------
{
  const { ctx, page, errors } = await open({ width: 1920, height: 1080, live: false, path: "#skjar" });
  const modal = await page.evaluate(() => ({
    focus: document.activeElement?.id,
    inert: [...document.body.children].filter((e) => e.id !== "screen").every((e) => (e as HTMLElement).inert),
  }));
  await page.click("#sGo");
  await page.waitForTimeout(900);
  const started = await page.evaluate(() => document.activeElement?.id);
  await shot(page, "screen-first.png");
  const longest = ordered.reduce((a: any, b: any) => (b.summary.length > a.summary.length ? b : a));
  for (let i = 0; i < ordered.indexOf(longest); i++) await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(900);
  const fit = await page.evaluate(() => {
    const say = document.getElementById("sSay")!, box = document.getElementById("sBody")!;
    return { text: say.textContent!.slice(0, 30), over: say.scrollHeight - box.clientHeight };
  });
  gate("screen mode fits the longest summary", fit.over <= 0 && fit.text === longest.summary.slice(0, 30), JSON.stringify(fit));
  const top = await page.textContent("#sTop");
  gate("screen mode shows no place or table beside the words", top === longest.topic, JSON.stringify(top));
  await page.keyboard.press("Escape");
  gate("Esc leaves screen mode", await page.evaluate(() => document.getElementById("screen")!.hidden));
  await page.click("#toScreen");
  await page.waitForTimeout(300);
  const inScreen = await page.evaluate(() => document.activeElement?.id);
  await page.keyboard.press("Escape");
  const after = await page.evaluate(() => ({ focus: document.activeElement?.id, inert: [...document.body.children].some((e) => (e as HTMLElement).inert) }));
  gate("screen mode holds focus with the page behind inert, and Esc gives focus back",
    modal.focus === "sGo" && modal.inert && started === "screen" && inScreen === "sGo" && after.focus === "toScreen" && !after.inert,
    JSON.stringify({ modal, started, inScreen, after }));
  gate("no errors in screen mode", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---------- under talasaman.is's own Content-Security-Policy ----------
{
  const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://use.typekit.net https://p.typekit.net; img-src 'self' data: blob: https://*.tile.opentopomap.org; font-src 'self' data: https://use.typekit.net; media-src 'self' blob: https://lysusymxg3l4eqcn.public.blob.vercel-storage.com; connect-src 'self' https://vercel.com https://*.blob.vercel-storage.com; frame-src https://www.youtube-nocookie.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com; object-src 'none'";
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("https://talasaman.is/ordrett-csp-test", (route) =>
    route.fulfill({ status: 200, headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": CSP }, body: readFileSync(join(SITE, "index.html"), "utf8") }));
  await page.goto("https://talasaman.is/ordrett-csp-test");
  await page.waitForTimeout(2500);
  const live = await page.textContent("#fetched");
  await page.click("#playSeq");
  await page.waitForTimeout(2600);
  const t = await page.textContent("#deckTime");
  gate("under talasaman.is CSP: live data and playback", !/Náði ekki/.test(live ?? "") && /^0:0[1-9]/.test(t ?? ""), `${live} | ${t}`);
  gate("under talasaman.is CSP: no violations or errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---------- the site: old addresses still answer, the record page links resolve ----------
{
  const old = ["samhljomur.html", "video.html", "report.html", "songbook.html", "songbook.pdf", "video-standalone.html", "medley.mp4", "poster.png", "poster-alt.png", "media/medley.mp3"];
  const status = await Promise.all(old.map((p) => fetch(BASE + p, { method: "HEAD" }).then((r) => r.status)));
  gate("every medley address still answers", status.every((s) => s === 200), old.map((p, i) => `${p} ${status[i]}`).join(", "));
  const landing = createHash("sha1").update(readFileSync(join(SITE, "samhljomur.html"))).digest("hex");
  gate("the medley's front page is kept byte for byte", landing === "a1b8538ab0336bcf20cf5ea794b66ce43db95d76", landing);
  const front = readFileSync(join(SITE, "index.html"), "utf8");
  gate("the front page does not link to the medley", !/href="(samhljomur|video|report|songbook)[^"]*"/.test(front));
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(BASE + "saga.html");
  const links = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!));
  const linkStatus = await Promise.all(links.map((h) => fetch(new URL(h, BASE + "saga.html"), { method: "HEAD" }).then((r) => r.status)));
  gate("record page: every link resolves", linkStatus.every((s) => s === 200), links.map((h, i) => `${h} ${linkStatus[i]}`).join(", "));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  gate("record page: no horizontal scroll at 390px", overflow <= 0, `${overflow}px`);
  await shot(page, "phone-saga.png", true);
  await ctx.close();
}

// ---------- the narrowest phones, and readers who set large text ----------
for (const [path, name] of [["", "front page"], ["saga.html", "record page"]] as const) {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 720 } });
  const page = await ctx.newPage();
  await page.route("**/api/v1/summaries", (route) => route.abort());
  await page.goto(BASE + path);
  await page.waitForTimeout(500);
  const narrow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.waitForTimeout(300);
  const large = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  gate(`${name}: no horizontal scroll at 320px, nor with text at 200%`, narrow <= 0 && large <= 0, `${narrow}px, ${large}px`);
  await ctx.close();
}

await browser.close();
server.stop();
const report = results.join("\n") + `\n\n${failures ? failures + " FAILED" : "all gates pass"}  (snapshot ${snap.meta.generatedAt})\n`;
writeFileSync(join(QA, "gates.txt"), report);
console.log(report);
process.exit(failures ? 1 : 0);
