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
// old addresses all still answer, and the record page links resolve. Reader
// gates: no sideways scrolling at 320px or with text at 200%, focus in the
// dialogs, button names, links to one summary, search, print, the live redraw
// (against a held, controlled answer), a slow connection, screen mode by mouse
// and by touch, long summaries in screen mode on a projector and on a phone,
// the mountain full screen with the words following the voice, a recording
// measured from its own file, and the share card and icons. Layout gates:
// Pretext counts the lines of every summary as the page sets them; every
// poster holds its summary whole at 36px or larger, a voiced one in the shape
// of its voice; screen mode sets every summary whole on a projector; and
// without Intl.Segmenter the page measures as it did before.
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
// Wait (up to 20 s, for the network) until the player clock has moved past 0:00.
const playing = (page: Page) => page.waitForFunction(() => /^0:0[1-9]|^0:[1-5]\d/.test(document.getElementById("deckTime")?.textContent ?? ""), null, { timeout: 20000 }).catch(() => {});
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

// ---------- lines laid out before they are drawn: Pretext, and every poster ----------
{
  const { ctx, page, errors } = await open({ width: 390, height: 844, live: false });
  const agree = await page.evaluate(() => {
    const P = (window as any).Pretext;
    if (!P) return null;
    let same = 0, more = 0, fewer = 0;
    for (const e of document.querySelectorAll<HTMLElement>("#list .words")) {
      const cs = getComputedStyle(e), lh = parseFloat(cs.lineHeight);
      const dom = Math.round(e.getBoundingClientRect().height / lh);
      const n = P.layoutWithLines(P.prepareWithSegments(e.textContent!, `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, { whiteSpace: "pre-wrap" }), e.clientWidth, lh).lines.length;
      if (n === dom) same++; else if (n > dom) more++; else fewer++;
    }
    return { same, more, fewer };
  });
  gate("Pretext is inlined, and counts the lines of every summary as the page sets them, or one more, never fewer",
    !!agree && agree.fewer === 0 && agree.same + agree.more === snap.data.length && agree.same >= snap.data.length * 0.95, JSON.stringify(agree));

  // Every poster: its frames hold the summary whole and in order, at 36px or larger; a summary
  // with a recording is set in the shape of its voice, on one frame.
  const voicedIds = new Set(voiced.map((r: any) => r.id));
  const wrong: string[] = [];
  let smallest = Infinity, shaped = 0;
  const split: string[] = [];
  for (const r of ordered) {
    await page.click(`[data-poster="${r.id}"]`);
    await page.waitForFunction(() => (document.getElementById("shade") as HTMLDialogElement).open &&
      [...document.querySelectorAll<HTMLImageElement>("#posterFrames img")].every((i) => i.complete && i.naturalWidth > 0));
    const frames = await page.$$eval("#posterFrames img", (is) => is.map((i) => {
      const im = i as HTMLImageElement;
      return { size: im.naturalWidth + "x" + im.naturalHeight, alt: im.alt, px: Number(im.dataset.px), shape: im.dataset.shape };
    }));
    await page.keyboard.press("Escape");
    const n = frames.length;
    const words = frames.map((f, i) => {
      const lead = `${r.location}, borð ${r.table}${n > 1 ? `, ${i + 1} af ${n}` : ""}: `;
      return f.alt.startsWith(lead) ? f.alt.slice(lead.length) : "\u0000";
    }).join("");
    const voice = voicedIds.has(r.id);
    if (voice && frames.every((f) => f.shape === "voice")) shaped++;
    if (n > 1) split.push(`${r.id.slice(0, 8)}: ${n} at ${frames[0].px}px`);
    for (const f of frames) smallest = Math.min(smallest, f.px);
    if (words !== r.summary || frames.some((f) => f.size !== "1080x1920" || !(f.px >= 36)) ||
      (voice ? n !== 1 || frames[0].shape !== "voice" : frames.some((f) => f.shape !== "words"))) wrong.push(r.id.slice(0, 8));
  }
  gate("posters: every summary whole and in order across its frames, 1080 x 1920, at 36px or larger",
    wrong.length === 0 && smallest >= 36, `smallest ${smallest}px; on more than one frame: ${split.join(", ") || "none"}${wrong.length ? "; wrong: " + wrong.join(", ") : ""}`);
  gate("posters: a summary with a recording is set in the shape of its voice", shaped === voiced.length, `${shaped} of ${voiced.length}`);
  gate("no errors drawing every poster", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---------- the contents line, and a link to one summary ----------
{
  const id = ordered[Math.floor(ordered.length / 2)].id;
  const { ctx, page } = await open({ width: 390, height: 844, live: false, path: "#e-" + id });
  const t = await page.evaluate(() => {
    const e = document.querySelector<HTMLElement>(":target"), r = e?.getBoundingClientRect();
    return { id: e?.id, top: r ? Math.round(r.top) : null, bg: e ? getComputedStyle(e).backgroundColor : "" };
  });
  gate("a link to one summary lands on it, marked", t.id === "e-" + id && t.top !== null && t.top >= 0 && t.top < 120 && t.bg !== "rgba(0, 0, 0, 0)", JSON.stringify(t));
  const toc = await page.$$eval(".toc a", (as) => as.map((a) => [a.textContent, !!document.querySelector(a.getAttribute("href")!)]));
  gate("contents line: every link has its section", toc.length === 4 && toc.every(([, ok]) => ok), JSON.stringify(toc));
  await ctx.close();
}

// ---------- search: marks what it finds and leaves the words as they are ----------
{
  const { ctx, page, errors } = await open({ width: 390, height: 844, live: false });
  const look = async (q: string) => {
    await page.fill("#q", q);
    await page.waitForTimeout(400);
    return page.evaluate(() => ({
      shown: [...document.querySelectorAll<HTMLElement>("#list .entry")].map((a) => [a.id.slice(2), a.querySelector(".words")!.textContent!]),
      marks: [...document.querySelectorAll("#list .words mark.q")].map((m) => m.textContent!),
      found: document.getElementById("found")!.textContent,
      empty: document.querySelector("#list .empty")?.textContent ?? "",
    }));
  };
  const q = "Símann";
  const want = ordered.filter((r: any) => [r.summary, r.location, r.topic].some((s: string) => s.toLocaleLowerCase("is").includes(q.toLocaleLowerCase("is"))));
  const one = (n: number) => n % 10 === 1 && n % 100 !== 11;
  const hit = await look(q);
  gate("search: finds every summary with the word, marks it, and leaves the words as they are",
    want.length > 0 && JSON.stringify(hit.shown) === JSON.stringify(want.map((r: any) => [r.id, r.summary])) &&
    hit.marks.length >= want.length && hit.marks.every((m) => m.toLocaleLowerCase("is") === q.toLocaleLowerCase("is")) &&
    hit.found === `${want.length} ${one(want.length) ? "samantekt fannst" : "samantektir fundust"}.`,
    `${hit.shown.length} shown, ${want.length} expected, ${hit.marks.length} marks, "${hit.found}"`);
  const miss = await look("qqzzqq");
  const cleared = await look("");
  gate("search: says when nothing is found; clearing it brings every summary back unmarked",
    miss.shown.length === 0 && miss.found === "Engin samantekt fannst." && miss.empty !== "" &&
    cleared.shown.length === snap.data.length && cleared.marks.length === 0 && cleared.found === "",
    `${miss.found} | ${cleared.shown.length} shown, ${cleared.marks.length} marks`);
  gate("no errors while searching", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---------- on paper ----------
{
  const { ctx, page } = await open({ width: 390, height: 844, live: false });
  await page.emulateMedia({ media: "print" });
  const p = await page.evaluate(() => {
    const shown = (e: Element) => e.getClientRects().length > 0;
    return {
      players: ["#mtn", "#playSeq", "#q", "#toScreen", "#list .listen"].filter((s) => shown(document.querySelector(s)!)),
      words: [...document.querySelectorAll("#list .words")].filter(shown).length,
      notes: [...document.querySelectorAll(".note-row")].filter(shown).length,
      colours: [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.body).color],
    };
  });
  gate("on paper: every summary and the AI sheet, no players or controls, black on white",
    p.players.length === 0 && p.words === snap.data.length && p.notes === expectedAI.length && p.colours.join() === "rgb(255, 255, 255),rgb(0, 0, 0)", JSON.stringify(p));
  await shotOf(page, ".sheet", "print-sheet.png");
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
  await playing(page);
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
  const clock = /^0:(\d\d) \/ (\d+):(\d\d)$/.exec(swell.time ?? "");
  const shown = clock ? Number(clock[1]) : -1;
  const total = clock ? Number(clock[2]) * 60 + Number(clock[3]) : 0;
  const longest = Math.max(...voiced.map((r: any) => facts[r.id].seconds));
  // A recording measured from the live answer can make the mountain longer than the snapshot.
  gate("all at once: voices join as the sweep reaches them",
    /raddir tala/.test(swell.now ?? "") && shown >= 15 && shown <= 30 && total + 1 >= longest, JSON.stringify(swell));
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

// ---------- the live answer: unchanged data is not redrawn; a redraw keeps focus ----------
for (const changed of [false, true]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  let release = () => {};
  const held = new Promise<void>((ok) => { release = ok; });
  const data = changed ? snap.data.slice(1) : snap.data;
  await page.route("**/api/v1/summaries", async (route) => {
    await held;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data, meta: { ...snap.meta, generatedAt: "2026-10-11T09:00:00.000Z", count: data.length } }) });
  });
  await page.goto(BASE);
  const keep = voiced.find((r: any) => r.id !== snap.data[0].id).id;
  await page.focus(`.listen[data-id="${keep}"]`);
  await page.evaluate(() => { (document.querySelector("#list .entry") as any).fromSnapshot = true; });
  release();
  await page.waitForFunction(() => /11\. október/.test(document.getElementById("fetched")!.textContent ?? ""));
  const after = await page.evaluate((id) => ({
    redrawn: !(document.querySelector("#list .entry") as any).fromSnapshot,
    entries: document.querySelectorAll("#list .entry").length,
    focus: (document.activeElement as HTMLElement).dataset.id === id,
  }), keep);
  if (!changed) gate("live answer unchanged from the snapshot: nothing is redrawn", !after.redrawn && after.entries === snap.data.length && after.focus, JSON.stringify(after));
  else gate("live answer changed: the list is redrawn, focus stays on the same button", after.redrawn && after.entries === data.length && after.focus, JSON.stringify(after));
  await ctx.close();
}

// ---------- a live redraw with new summaries above: a linked summary stays put ----------
{
  const target = ordered[Math.floor(ordered.length / 2)];
  const data = [...[0, 1, 2].map((k) => ({ ...ordered[k], id: ordered[k].id.slice(0, -2) + "x" + k })), ...snap.data];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  let release = () => {};
  const held = new Promise<void>((ok) => { release = ok; });
  await page.route("**/api/v1/summaries", async (route) => {
    await held;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data, meta: { ...snap.meta, generatedAt: "2026-10-11T09:00:00.000Z", count: data.length } }) });
  });
  await page.goto(BASE + "#e-" + target.id);
  await page.waitForTimeout(300);
  const where = (id: string) => page.evaluate((id) => {
    const e = document.getElementById("e-" + id)!;
    return { top: Math.round(e.getBoundingClientRect().top), bg: getComputedStyle(e).backgroundColor, entries: document.querySelectorAll("#list .entry").length };
  }, id);
  const before = await where(target.id);
  release();
  await page.waitForFunction(() => /11\. október/.test(document.getElementById("fetched")!.textContent ?? ""));
  await page.waitForTimeout(200);
  const after = await where(target.id);
  gate("a live redraw with new summaries above keeps a linked summary where it was, marked",
    after.entries === data.length && Math.abs(after.top - before.top) <= 1 && after.bg === before.bg && after.bg !== "rgba(0, 0, 0, 0)", JSON.stringify({ before, after }));
  await ctx.close();
}

// ---------- a live redraw while a poster is open: Esc still gives focus back ----------
{
  const data = snap.data.slice(1);
  const id = ordered.find((r: any) => r.id !== snap.data[0].id).id;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  let release = () => {};
  const held = new Promise<void>((ok) => { release = ok; });
  await page.route("**/api/v1/summaries", async (route) => {
    await held;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data, meta: { ...snap.meta, generatedAt: "2026-10-11T09:00:00.000Z", count: data.length } }) });
  });
  await page.goto(BASE);
  await page.focus(`[data-poster="${id}"]`);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => (document.getElementById("shade") as HTMLDialogElement).open);
  release();
  await page.waitForFunction(() => /11\. október/.test(document.getElementById("fetched")!.textContent ?? ""));
  await page.keyboard.press("Escape");
  const back = await page.evaluate((id) => ({
    open: (document.getElementById("shade") as HTMLDialogElement).open,
    focus: (document.activeElement as HTMLElement).dataset?.poster === id,
    entries: document.querySelectorAll("#list .entry").length,
  }), id);
  gate("a live redraw while a poster is open: Esc gives focus to the redrawn button",
    !back.open && back.focus && back.entries === data.length, JSON.stringify(back));
  await ctx.close();
}

// ---------- a new recording is measured from the file and joins the mountain ----------
{
  const ALPH = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
  const pace = (r: any) => {
    const f = facts[r.id];
    if (!f || f.silent || !f.env) return 0;
    let active = 0;
    for (const c of f.env) if (ALPH.indexOf(c) / 63 > 0.15) active++;
    const activeS = active * f.seconds / f.env.length;
    const words = r.summary.trim().split(/\s+/).filter(Boolean).length;
    return activeS > 2 ? words / (activeS / 60) : 0;
  };
  const donor = snap.data.filter((r: any) => r.audio && pace(r) >= 90 && pace(r) <= 240)
    .sort((a: any, b: any) => facts[a.id].seconds - facts[b.id].seconds)[0];
  const audioBytes = Buffer.from(await fetch(donor.audio).then((r) => r.arrayBuffer()));
  const newId = "00000000-0000-4000-8000-000000000001";
  const linesNow = snap.data.filter((r: any) => r.audio && facts[r.id] && !facts[r.id].silent && facts[r.id].env).length;
  const data = [...snap.data, { ...donor, id: newId, audio: `https://talasaman.is/api/v1/summaries/${newId}/audio` }];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/api/v1/summaries**", (route) => {
    const url = route.request().url();
    if (url.includes("/audio")) return route.fulfill({ contentType: "audio/webm", body: audioBytes });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ data, meta: { ...snap.meta, generatedAt: "2026-10-11T10:10:00.000Z", count: data.length } }) });
  });
  await page.goto(BASE);
  await page.waitForFunction((n) => {
    const label = document.getElementById("mtn")?.getAttribute("aria-label") ?? "";
    return label.startsWith(String(n));
  }, linesNow + 1, { timeout: 20000 }).catch(() => {});
  const got = await page.evaluate((id) => ({
    label: document.getElementById("mtn")?.getAttribute("aria-label"),
    row: !!document.getElementById("e-" + id),
    failed: document.querySelector("#e-" + id + " .aside")?.textContent ?? "",
  }), newId);
  gate("a recording the build never measured joins the mountain, from the file itself",
    (got.label ?? "").startsWith(String(linesNow + 1)) && got.row && got.failed === "" && errors.length === 0,
    JSON.stringify({ ...got, errors }));
  await ctx.close();

  // The mountain, full screen: one voice, so the words can be seen to follow it.
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page2 = await ctx2.newPage();
  const errors2: string[] = [];
  page2.on("pageerror", (e) => errors2.push(String(e)));
  await page2.route("**/api/v1/summaries**", (route) => {
    const url = route.request().url();
    if (url.includes("/audio")) return route.fulfill({ contentType: "audio/webm", body: audioBytes });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: [donor], meta: { ...snap.meta, generatedAt: "2026-10-11T10:10:00.000Z", count: 1 } }) });
  });
  await page2.goto(BASE);
  await page2.waitForFunction(() => /10:10/.test(document.getElementById("fetched")?.textContent ?? ""));
  await page2.click("#toHall");
  await page2.waitForFunction(() => document.activeElement?.id === "hGo");
  const opened = await page2.evaluate(() => ({
    focus: document.activeElement?.id,
    inert: [...document.body.children].filter((e) => e.id !== "hall").every((e) => (e as HTMLElement).inert),
  }));
  await page2.click("#hGo");
  const firstWord = donor.summary.trim().split(/\s+/)[0];
  // A few seconds in, the marked word has to have left the first token. Silence does not count.
  await page2.waitForFunction((first) => {
    const m = document.querySelector("#hSay mark");
    const pos = document.getElementById("hPos")?.textContent ?? "";
    const sec = Number(/^0:(\d+)/.exec(pos)?.[1] ?? 0);
    return !!m && !!m.textContent && m.textContent !== first && sec >= 3;
  }, firstWord, { timeout: 20000 }).catch(() => {});
  const hall = await page2.evaluate(() => {
    const m = document.querySelector("#hSay mark");
    const stage = document.getElementById("hStage")!.getBoundingClientRect();
    const cv = document.getElementById("hMtn")!.getBoundingClientRect();
    return {
      word: m?.textContent ?? "",
      say: document.getElementById("hSay")!.textContent,
      who: document.getElementById("hWho")!.textContent,
      cv: [Math.round(cv.width), Math.round(cv.height)],
      stage: [Math.round(stage.width), Math.round(stage.height)],
      coloured: (() => {
        const c = document.getElementById("hMtn") as HTMLCanvasElement;
        const g = c.getContext("2d")!;
        const px = g.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < px.length; i += 16) if (px[i] > 40 && (px[i] !== px[i + 1] || px[i] !== px[i + 2])) n++;
        return n;
      })(),
    };
  });
  const words = donor.summary.trim().split(/\s+/);
  const moved = words.includes(hall.word) && hall.word !== words[0];
  gate("the mountain full screen: the voice is drawn in time and its current word is marked",
    opened.focus === "hGo" && opened.inert && moved && hall.say === donor.summary &&
    hall.who.includes(donor.location) && hall.cv[0] > 200 && hall.cv[0] <= hall.stage[0] + 1 &&
    hall.cv[1] <= hall.stage[1] + 1 && hall.coloured > 20 && errors2.length === 0,
    JSON.stringify({ opened, hall, errors: errors2 }));
  await page2.keyboard.press("Escape");
  const back = await page2.evaluate(() => ({ hidden: document.getElementById("hall")!.hidden, focus: document.activeElement?.id }));
  gate("Esc leaves the mountain and gives focus back", back.hidden && back.focus === "toHall", JSON.stringify(back));
  await ctx2.close();
}

// ---------- a slow connection: the player says it is fetching, then counts ----------
{
  const { ctx, page } = await open({ width: 390, height: 844, live: false });
  await page.route("**/api/v1/summaries/*/audio", async (route) => { await new Promise((ok) => setTimeout(ok, 2000)); await route.continue(); });
  await page.click("#list .listen >> nth=0");
  await page.waitForTimeout(600);
  const waiting = await page.textContent("#deckTime");
  const counted = await page.waitForFunction(() => /^0:0\d \/ 0:\d\d$/.test(document.getElementById("deckTime")!.textContent ?? ""), null, { timeout: 15000 }).then(() => true, () => false);
  gate("on a slow connection the player says it is fetching, then counts", waiting === "Sæki upptökuna …" && counted, `${waiting} | ${await page.textContent("#deckTime")}`);
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
  await page.mouse.move(960, 500);
  const at = () => page.textContent("#sPos");
  const k = ordered.indexOf(longest) + 1, N = ordered.length;
  const p0 = await at();
  await page.click("#sNext");
  const p1 = await at();
  await page.click("#sPrev");
  const p2 = await at();
  await page.click("#sToggle");
  const l1 = await page.getAttribute("#sToggle", "aria-label");
  await page.click("#sToggle");
  const l2 = await page.getAttribute("#sToggle", "aria-label");
  await page.waitForTimeout(3500);
  const sleep = await page.evaluate(() => [getComputedStyle(document.querySelector(".screen .ctl")!).opacity, getComputedStyle(document.getElementById("screen")!).cursor]);
  gate("screen mode controls: previous, pause and next work, then sleep with the pointer",
    p0 === `${k} / ${N}` && p1 === `${k + 1} / ${N}` && p2 === p0 && l1 === "Halda áfram" && l2 === "Gera hlé" && sleep.join() === "0,none",
    JSON.stringify({ p0, p1, p2, l1, l2, sleep }));
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

// ---------- screen mode: a summary written as a long list ----------
{
  const lines = (r: any) => r.summary.split("\n").length;
  const listy = ordered.reduce((a: any, b: any) => (lines(b) > lines(a) ? b : a));
  for (const [width, height] of [[1920, 1080], [390, 844]]) {
    const { ctx, page } = await open({ width, height, live: false, path: "#skjar" });
    await page.click("#sGo");
    for (let i = 0; i < ordered.indexOf(listy); i++) await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(900);
    const m = await page.evaluate(() => {
      const say = document.getElementById("sSay")!, box = document.getElementById("sBody")!;
      return {
        text: say.textContent, px: parseFloat(say.style.fontSize), cols: getComputedStyle(say).columnCount,
        over: say.scrollHeight - box.clientHeight, room: box.clientHeight, scroll: getComputedStyle(box).overflowY,
        gap: Math.round(say.getBoundingClientRect().top - box.getBoundingClientRect().top),
      };
    });
    const shown = { px: Math.round(m.px * 10) / 10, cols: m.cols, over: m.over, gap: m.gap };
    // one column holds at least one line per line break, so it can never be set larger than this
    const oneColumn = m.room / (lines(listy) * 1.3);
    if (width > 1000) gate("screen mode on a wide screen sets a summary written as a long list in columns, larger than one column could, whole",
      m.text === listy.summary && m.cols !== "auto" && m.px > oneColumn * 1.2 && m.over <= 0, JSON.stringify({ ...shown, oneColumn: Math.round(oneColumn * 10) / 10 }));
    else gate("screen mode on a phone: a summary too long for the screen starts at the top and scrolls, inside the frame",
      m.text === listy.summary && m.cols === "auto" && m.over > 0 && m.gap === 0 && m.scroll === "auto", JSON.stringify({ ...shown, scroll: m.scroll }));
    await ctx.close();
  }
}

// ---------- screen mode on a projector: every summary, set whole ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/api/v1/summaries**", (route) => route.abort());
  await page.goto(BASE + "#skjar");
  await page.waitForTimeout(500);
  await page.click("#sGo");
  const seen: { px: number; cols: string; over: number }[] = [];
  for (let i = 0; i < ordered.length; i++) {
    await page.waitForTimeout(40);
    seen.push(await page.evaluate(() => {
      const say = document.getElementById("sSay")!, box = document.getElementById("sBody")!;
      return { px: Math.round(parseFloat(say.style.fontSize) * 10) / 10, cols: say.style.columnCount || "1", over: say.scrollHeight - box.clientHeight };
    }));
    await page.keyboard.press("ArrowRight");
  }
  const over = seen.filter((x) => x.over > 0).length, px = seen.map((x) => x.px).sort((a, b) => a - b);
  gate("screen mode on a projector sets every summary whole, without scrolling",
    seen.length === ordered.length && over === 0 && errors.length === 0,
    `${seen.length} summaries, ${over} scroll; smallest ${px[0]}px, median ${px[px.length >> 1]}px; ${seen.filter((x) => x.cols !== "1").length} in columns`);
  await ctx.close();
}

// ---------- without Intl.Segmenter Pretext cannot run: the page measures as it did before ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" });
  await ctx.addInitScript(() => { delete (Intl as any).Segmenter; });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/api/v1/summaries**", (route) => route.abort());
  await page.goto(BASE);
  await page.waitForTimeout(500);
  const longest = ordered.reduce((a: any, b: any) => (b.summary.length > a.summary.length ? b : a));
  await page.click(`[data-poster="${longest.id}"]`);
  await page.waitForFunction(() => (document.getElementById("posterImg") as HTMLImageElement).naturalWidth > 0);
  const p = await page.$$eval("#posterFrames img", (is) => is.map((i) => [(i as HTMLImageElement).naturalWidth, (i as HTMLImageElement).naturalHeight, (i as HTMLImageElement).alt]));
  await page.keyboard.press("Escape");
  await page.evaluate(() => { location.hash = "skjar"; });
  await page.click("#sGo");
  for (let i = 0; i < ordered.indexOf(longest); i++) await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);
  const fit = await page.evaluate(() => { const say = document.getElementById("sSay")!, box = document.getElementById("sBody")!; return { text: say.textContent!.slice(0, 30), over: say.scrollHeight - box.clientHeight }; });
  gate("without Intl.Segmenter: a poster and screen mode as before, without errors",
    p.length === 1 && p[0][0] === 1080 && p[0][1] === 1920 && p[0][2] === `${longest.location}, borð ${longest.table}: ${longest.summary}` &&
    fit.text === longest.summary.slice(0, 30) && fit.over <= 0 && errors.length === 0, JSON.stringify({ poster: p.map((x) => x[0] + "x" + x[1]), fit, errors }));
  await ctx.close();
}

// ---------- screen mode on a touch screen ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.route("**/api/v1/summaries", (route) => route.abort());
  await page.goto(BASE + "#skjar");
  await page.waitForTimeout(500);
  await page.tap("#sGo");
  await page.waitForTimeout(3600);
  const asleep = await page.evaluate(() => getComputedStyle(document.querySelector(".screen .ctl")!).opacity);
  const b = (await page.locator("#sNext").boundingBox())!;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(400);
  const first = await page.textContent("#sPos");
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(400);
  const second = await page.textContent("#sPos");
  const N = ordered.length;
  gate("screen mode on a touch screen: the first tap wakes the controls, the next one turns the page",
    asleep === "0" && first === `1 / ${N}` && second === `2 / ${N}`, JSON.stringify({ asleep, first, second }));
  await shot(page, "phone-screen.png");
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
  await playing(page);
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

  const size = (f: string) => {
    const p = join(SITE, f);
    if (!existsSync(p)) return "missing";
    const b = readFileSync(p);
    return b.readUInt32BE(0) === 0x89504e47 ? `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}` : "not a PNG";
  };
  const ROOT = "https://audreyt.github.io/samhljomur/";
  const tags = (f: string) => Object.fromEntries([...readFileSync(join(SITE, f), "utf8").slice(0, 6000)
    .matchAll(/<(?:meta (?:property|name)="([^"]+)" content|link rel="([^"]+)" href)="([^"]*)"/g)].map((m) => [m[1] ?? m[2], m[3]]));
  const unshared = [["index.html", ""], ["saga.html", "saga.html"]].filter(([f, u]) => {
    const t = tags(f);
    return !(t["og:url"] === ROOT + u && t.canonical === ROOT + u && t["og:image"] === ROOT + "ordrett-card.png" && t["og:image:alt"] &&
      t["twitter:card"] === "summary_large_image" && t["apple-touch-icon"] === "ordrett-icon.png" && t.icon?.startsWith("data:image/svg+xml,"));
  }).map(([f]) => f);
  const tab = await page.evaluate(async () => {
    const i = new Image();
    i.src = document.querySelector<HTMLLinkElement>('link[rel="icon"]')!.href;
    return i.decode().then(() => "drawn", () => "broken");
  });
  const [card, home] = [size("ordrett-card.png"), size("ordrett-icon.png")];
  gate("sharing: a 1200 x 630 card, a 180 x 180 home-screen icon, a tab icon, and both pages point at them",
    card === "1200x630" && home === "180x180" && tab === "drawn" && unshared.length === 0, `card ${card}, icon ${home}, tab icon ${tab}${unshared.length ? ", missing tags: " + unshared.join(", ") : ""}`);
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
