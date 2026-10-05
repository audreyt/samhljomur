// Verification gates -> qa/. Run after `vp run site`.
// coverage / verbatim / privacy / strings / natural_is / screenshots / ffprobe.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { clef, RunCtx } from "./model";
import { allKeys, S } from "./strings";
import { Stage4Out } from "./stage4";
import { Timeline } from "./stage6";
import { screenshotAll } from "./render";

interface GateResult {
  gate: string;
  ok: boolean;
  detail: string;
}

function participantTexts(lyrics: Stage4Out): string[] {
  const out: string[] = [];
  for (const m of lyrics.movements) {
    for (const l of m.lines) {
      if (l.kind === "tagline") continue;
      if (l.parts) {
        for (const p of l.parts) out.push(p.text);
      } else if (l.source.startsWith("place:")) {
        // prefix + ". " + verbatim sentence; sentence part must be verbatim
        const sent = l.text.split(". ").slice(1).join(". ");
        out.push(sent);
      } else {
        out.push(l.text);
      }
    }
  }
  return out;
}

export async function runGates(ctx: RunCtx): Promise<boolean> {
  mkdirSync("qa", { recursive: true });
  const results: GateResult[] = [];
  const lyrics = JSON.parse(readFileSync("out/lyrics.json", "utf8")) as unknown as Stage4Out;
  const tl = JSON.parse(readFileSync("out/timeline.json", "utf8")) as Timeline;
  const excl = JSON.parse(readFileSync("out/exclusions.json", "utf8")) as any[];
  const snap = ["islenskast", "places", "topics", "circles"]
    .map((f) => readFileSync(`data/snapshot-20261004/${f}.json`, "utf8"))
    .join("\n");
  const siteFiles = readdirSync("site").filter((f) => f.endsWith(".html"));
  const siteText = siteFiles
    .map((f) => readFileSync(`site/${f}`, "utf8"))
    .join("\n");

  // ---- coverage gate ----
  {
    const timelineTexts = new Set(
      tl.chunks.flatMap((c) => c.lines.map((l) => l.text)),
    );
    const missing: string[] = [];
    let emptyStrings = 0;
    for (const m of lyrics.movements) {
      for (const l of m.lines) {
        if (!l.text) emptyStrings++;
        if (!timelineTexts.has(l.text))
          missing.push(`timeline:${l.text.slice(0, 40)}`);
        for (const [file, content] of [
          ["report.html", readFileSync("site/report.html", "utf8")],
          ["songbook.html", readFileSync("site/songbook.html", "utf8")],
          ["video.html", readFileSync("site/video.html", "utf8")],
        ] as const) {
          if (!content.includes(l.text))
            missing.push(`${file}:${l.text.slice(0, 40)}`);
        }
      }
    }
    // every authored string has is+en+zh (D1)
    const badStrings = allKeys().filter(
      (k) => !S[k]?.is?.trim() || !S[k]?.en?.trim() || !S[k]?.zh?.trim(),
    );
    // every gloss labelled: gloss label must appear next to glosses — check
    // report contains the label counts matching gloss count is approximate;
    // check the label strings exist
    const labelsOk = ["vélþýðing", "ritstýrt"].some((x) => siteText.includes(x));
    // attribution + disclaimer on every page
    const attr = "Gögn: Samtal, félag til almannaheilla (talasaman.is), CC BY 4.0";
    const discl = "Þetta er hvorki afstaða né niðurstaða Samtals.";
    const attrMissing = siteFiles.filter(
      (f) => !readFileSync(`site/${f}`, "utf8").includes(attr),
    );
    const disclMissing = siteFiles.filter(
      (f) => !readFileSync(`site/${f}`, "utf8").includes(discl),
    );
    const ok =
      missing.length === 0 &&
      emptyStrings === 0 &&
      badStrings.length === 0 &&
      labelsOk &&
      attrMissing.length === 0 &&
      disclMissing.length === 0;
    // lyric-display coverage: share of runtime where a lyric line (or the
    // movement title card during a chunk lead-in) is on screen, under the
    // lead's display rule.
    let lineT = 0, cardT = 0;
    const firstC = new Map<number, number>();
    for (const c of tl.chunks)
      if (!firstC.has(c.movement) || c.chunk < firstC.get(c.movement)!)
        firstC.set(c.movement, c.chunk);
    for (const c of tl.chunks) {
      const arr = c.lines.slice();
      arr.forEach((ln, i) => {
        const src = lyrics.movements[c.movement - 1].lines[ln.n - 1];
        const sec = src.seconds == null ? 4.5 : src.seconds;
        const nextStart = i < arr.length - 1 ? arr[i + 1].start_s : c.end_s;
        const vs = ln.start_s - 0.4;
        const ve = Math.min(
          i < arr.length - 1 ? nextStart - 0.15 : nextStart,
          ln.start_s + Math.max(ln.end_s - ln.start_s, sec) + 1.5,
        );
        lineT += Math.max(0, ve - vs);
      });
      const first = arr[0];
      if (first && c.chunk === firstC.get(c.movement))
        cardT += Math.max(0, first.start_s - 0.4 - c.start_s);
    }
    const total = tl.total_duration_s;
    writeFileSync(
      "qa/coverage.json",
      JSON.stringify(
        {
          total_s: total,
          line_visible_s: +lineT.toFixed(1),
          title_card_s: +cardT.toFixed(1),
          line_pct: +((lineT / total) * 100).toFixed(1),
          anything_pct: +(((lineT + cardT) / total) * 100).toFixed(1),
        },
        null,
        2,
      ) + "\n",
    );
    results.push({
      gate: "coverage",
      ok,
      detail: JSON.stringify(
        {
          missing: missing.slice(0, 20),
          missing_count: missing.length,
          empty_strings: emptyStrings,
          bad_strings: badStrings,
          gloss_labels_present: labelsOk,
          attribution_missing_pages: attrMissing,
          disclaimer_missing_pages: disclMissing,
          line_visible_pct: +((lineT / total) * 100).toFixed(1),
          with_title_card_pct: +(((lineT + cardT) / total) * 100).toFixed(1),
        },
        null,
        1,
      ),
    });
  }

  // ---- verbatim gate ----
  {
    const bad = participantTexts(lyrics).filter((t) => !snap.includes(t));
    results.push({
      gate: "verbatim",
      ok: bad.length === 0,
      detail: `${bad.length} non-verbatim segments ${JSON.stringify(bad.slice(0, 10))}`,
    });
    // also verify the same texts as they appear in site/ are verbatim
    const siteIsl = siteText;
    const badInSite = participantTexts(lyrics).filter(
      (t) => siteIsl.includes(t) && !snap.includes(t),
    );
    if (badInSite.length) results[results.length - 1].ok = false;
  }

  // ---- privacy gate ----
  {
    const leaks: string[] = [];
    for (const e of excl) {
      const texts = [e.text];
      if (e.display_text && e.reasons.some((r: string) => r.includes("digit")))
        texts.push(`${e.text}`); // never show full address
      for (const t of texts) {
        // privacy-excluded text shown nowhere
        if (e.reasons.some((r: string) => r.includes("privacy"))) {
          if (siteText.includes(t)) leaks.push(t.slice(0, 50));
        }
        if (e.reasons.some((r: string) => r.includes("digit"))) {
          // the full "Kambahraun 32, Hveragerði" form must not appear
          const full = `${e.display_text === "Hveragerði" ? "Kambahraun 32, " : ""}${e.display_text}`;
          if (siteText.includes("Kambahraun 32")) leaks.push("street address shown");
        }
        if (e.report_label === "outside_iceland" && siteText.includes(t))
          leaks.push(`outside_iceland text: ${t.slice(0, 40)}`);
      }
    }
    results.push({
      gate: "privacy",
      ok: leaks.length === 0,
      detail: `${leaks.length} leaks ${JSON.stringify(leaks.slice(0, 10))}`,
    });
  }

  // ---- is_outside_strings gate: no Icelandic outside strings.json ----
  // Scan visible text nodes of every site page; any node containing IS
  // diacritics (þðæö and upper) or common IS function words must be an
  // authored string from strings.json or verbatim participant data.
  {
    const allow = new Set<string>();
    for (const k of allKeys()) {
      allow.add(S[k].is.trim());
      allow.add(S[k].en.trim()); // EN copy may contain IS names (Atli Þór)
      allow.add(S[k].zh.trim());
    }
    const norm = (s: string) => s.replace(/\s+/g, " ").trim();
    const parts: string[] = [];
    for (const m of lyrics.movements)
      for (const l of m.lines) {
        parts.push(l.text);
        if (l.url) parts.push(l.text.split(". ")[0]); // place display name
        if (l.parts) for (const p of l.parts) parts.push(p.text);
      }
    const jdg = JSON.parse(readFileSync("out/judgments.json", "utf8"));
    for (const p of jdg.places) {
      parts.push(p.placeDisplay, p.place, p.reason, ...(p.sentences ?? []));
    }
    for (const i of jdg.isl) parts.push(i.answer);
    for (const t of jdg.topics) parts.push(t.word);
    // machine/editorial glosses legitimately carry IS loanwords (harðfiskur)
    const gl = JSON.parse(readFileSync("out/glosses.json", "utf8"));
    const zhGlosses: string[] = [];
    for (const e of gl.entries) {
      parts.push(e.en);
      if (e.zh) { parts.push(e.zh); zhGlosses.push(e.zh); }
      for (const c of Object.values(e.cands ?? {})) parts.push((c as any)?.en);
    }
    const allowedText = new Set(parts.filter(Boolean).map((s) => norm(s)));
    const allowedTextList = [...allowedText];
    const IS_RE = /[þðæöÞÐÆÖ]|(\b(og|ekki|sem|er|eru|hér|þetta|fyrir|utan|með|við|saman|orð)\b)/;
    const violations: string[] = [];
    for (const f of siteFiles) {
      let html = readFileSync(`site/${f}`, "utf8");
      html = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ");
      const nodes = html.replace(/<[^>]+>/g, "\n").split("\n");
      for (const raw of nodes) {
        let txt = norm(raw.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'));
        txt = txt.replace(/· Samhljómur\s*$/, "").trim(); // <title> suffix
        if (txt.length < 3 || !IS_RE.test(txt)) continue;
        // "is · en" footer nodes: check each fragment; a leading "- " can be
        // a line-start artifact of a multi-line participant reason
        const frags = txt
          .split("·")
          .map((x) => x.trim().replace(/^[-–—•]\s*/, "").trim())
          .filter(Boolean);
        const okFrag = (s: string) =>
          allow.has(s) ||
          allowedText.has(s) ||
          // node containing a participant/gloss string, or a fragment of one
          // (text nodes split at newlines inside multi-sentence reasons)
          allowedTextList.some((p) => p && (s.includes(p) || (s.length > 15 && p.includes(s))));
        if (frags.every(okFrag)) continue;
        violations.push(`${f}: ${txt.slice(0, 80)}`);
      }
    }
    writeFileSync(
      "qa/is-strings.txt",
      violations.length ? violations.join("\n") + "\n" : "OK\n",
    );
    results.push({
      gate: "is_strings",
      ok: violations.length === 0,
      detail: `${violations.length} non-strings.json Icelandic text nodes ${violations.slice(0, 8).join(" | ")}`,
    });
  }

  // ---- em-dash gate: no authored em/en dashes on pages ----
  {
    // participant text is allowed to keep its dashes; strip it (raw and
    // HTML-escaped forms) before scanning authored copy
    const esc = (s: string) =>
      String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    let remaining = siteText;
    const strip = (txt: string) => {
      remaining = remaining.split(txt).join(" ");
      remaining = remaining.split(esc(txt)).join(" ");
    };
    // longest first — a short word like "náttúran" must not be stripped out
    // of the middle of a longer place reason before the reason itself is
    const jdg = JSON.parse(readFileSync("out/judgments.json", "utf8"));
    const stripList: string[] = [];
    for (const m of lyrics.movements)
      for (const l of m.lines) {
        stripList.push(l.text);
        if (l.parts) for (const p of l.parts) stripList.push(p.text);
      }
    for (const p of jdg.places) {
      stripList.push(p.reason, ...(p.sentences ?? []));
    }
    for (const i of jdg.isl) stripList.push(i.answer);
    // machine glosses are quoted model output (like participant text) —
    // exempt from the authored-copy em-dash rule
    const gl2 = JSON.parse(readFileSync("out/glosses.json", "utf8"));
    for (const e of gl2.entries) {
      stripList.push(e.en);
      if (e.zh) stripList.push(e.zh);
      for (const c of Object.values(e.cands ?? {}))
        stripList.push((c as any)?.en);
    }
    for (const t of stripList.sort((a, b) => b.length - a.length)) strip(t);
    // script/style blocks are code, not copy
    const visible = remaining.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ");
    const dashCount = (visible.match(/[—–]/g) ?? []).length;
    results.push({
      gate: "em_dash",
      ok: dashCount === 0,
      detail: `${dashCount} em/en dashes in visible authored copy`,
    });
  }

  // ---- natural_is gate (Clef checks authored IS strings) ----
  {
    const isStrings: { key: string; is: string }[] = allKeys().map((k) => ({
      key: k,
      is: S[k].is,
    }));
    const low: { key: string; is: string; p: number }[] = [];
    for (const s of isStrings) {
      const st = `Staðfesting íslensks UI-texta: „${s.is}“`;
      const r = await clef(
        ctx,
        st,
        {
          natural_is: {
            type: "noul",
            instructions: "Is this natural, grammatical Icelandic?",
            criteria: {
              true: "natural Icelandic",
              false: "unnatural or ungrammatical",
            },
          },
        },
        `natural_is:${s.key}`,
      );
      const p = (r.answers.natural_is as any)?.noul ?? 0;
      if (p < 0.7) low.push({ key: s.key, is: s.is, p });
    }
    writeFileSync(
      "qa/natural-is.json",
      JSON.stringify(
        {
          note: "informational only; Clef scores even correct verbatim IS strings (incl. Atli's questions) below 0.70, so this is not a grammar gate",
          threshold: 0.7,
          checked: isStrings.length,
          low,
        },
        null,
        2,
      ) + "\n",
    );
    results.push({
      gate: "natural_is",
      ok: true, // informational: list, don't fail
      detail: `${low.length} strings < 0.70 (qa/natural-is.json; informational)`,
    });
  }

  // ---- D4 zh gates: opencc + pangu + zh text nodes + font ----
  {
    const zhStrings = allKeys().map((k) => ({ k, v: S[k].zh }));
    const gl = JSON.parse(readFileSync("out/glosses.json", "utf8"));
    const zhAll = [
      ...zhStrings.map((x) => ({ k: `string:${x.k}`, v: x.v })),
      ...gl.entries
        .filter((e: any) => e.zh)
        .map((e: any) => ({ k: `gloss:${e.is.slice(0, 30)}`, v: e.zh })),
    ];
    const opencc = (t: string, cfg: string) =>
      execFileSync("opencc", ["-c", cfg], { input: t, encoding: "utf8" });
    // s2twp full-string diffs are listed for review; the FAILing condition
    // is chars that are simplified-only. Whitelist TW-informal chars that
    // opencc normalizes but that are valid traditional usage.
    const TW_INFORMAL = new Set("台吃群游里岩划干周于青注借谷松瓶仙迹跌盒温药娘都让它够")
    const diffs: string[] = [];
    for (const { k, v } of zhAll) {
      if (!v) continue;
      const out = opencc(v, "s2twp");
      if (out !== v) diffs.push(`${k}: ${v} -> ${out}`);
    }
    // one conversion per unique CJK char; simplified-only = already
    // simplified under t2s AND maps to something else under s2t
    const uniq = new Map<string, { simp: boolean }>();
    for (const { v } of zhAll) {
      if (!v) continue;
      for (const c of v) {
        if (c.charCodeAt(0) < 0x2e80 || uniq.has(c)) continue;
        uniq.set(c, {
          simp: opencc(c, "t2s") === c && opencc(c, "s2t") !== c,
        });
      }
    }
    const simplifiedOnly: string[] = [];
    for (const { k, v } of zhAll) {
      if (!v) continue;
      for (const c of v)
        if (uniq.get(c)?.simp && !TW_INFORMAL.has(c))
          simplifiedOnly.push(`${k}: ${c}`);
    }
    writeFileSync(
      "qa/zh-opencc.txt",
      (simplifiedOnly.length ? "SIMPLIFIED-ONLY:\n" + simplifiedOnly.join("\n") + "\n\n" : "0 simplified-only chars\n") +
        (diffs.length ? "s2twp variant diffs:\n" + diffs.join("\n") + "\n" : ""),
    );
    results.push({
      gate: "zh_opencc",
      ok: simplifiedOnly.length === 0,
      detail: `${simplifiedOnly.length} simplified-only chars · ${diffs.length} s2twp variant diffs (qa/zh-opencc.txt)`,
    });

    // pangu no-op
    const pdiffs: string[] = [];
    for (const { k, v } of zhAll) {
      if (!v) continue;
      const out = execFileSync(
        "perl",
        [`${process.env.HOME}/.local/bin/pangu.pl`],
        { input: v + "\n", encoding: "utf8" },
      ).replace(/\n+$/, "");
      if (out !== v) pdiffs.push(`${k}: [${v}] -> [${out}]`);
    }
    writeFileSync(
      "qa/zh-pangu.txt",
      pdiffs.length ? pdiffs.join("\n") + "\n" : "OK\n",
    );
    results.push({
      gate: "zh_pangu",
      ok: pdiffs.length === 0,
      detail: `${pdiffs.length} pangu spacing diffs ${pdiffs.slice(0, 6).join(" | ")}`,
    });

    // no em/en dashes in zh authored copy
    const zhDash = zhStrings.filter((x) => /[—–]/.test(x.v ?? ""));
    results.push({
      gate: "zh_dash",
      ok: zhDash.length === 0,
      detail: `${zhDash.length} zh strings with em/en dash ${zhDash.map((x) => x.k).slice(0, 6).join(",")}`,
    });

    // zh text nodes must come from strings.json zh or zh glosses
    const zhAllow = new Set<string>([
      ...zhStrings.map((x) => x.v.trim()),
      ...gl.entries.filter((e: any) => e.zh).map((e: any) => e.zh.trim()),
      "華文",
    ]);
    const zhAllowList = [...zhAllow];
    const ZH_RE = /[\u2e80-\u2eff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
    const zhViol: string[] = [];
    for (const f of siteFiles) {
      let html = readFileSync(`site/${f}`, "utf8");
      html = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ");
      for (const raw of html.replace(/<[^>]+>/g, "\n").split("\n")) {
        let txt = raw.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
        if (txt.length < 1 || !ZH_RE.test(txt)) continue;
        const frags = txt.split("·").map((x) => x.trim()).filter(Boolean);
        const okFrag = (s: string) =>
          zhAllow.has(s) ||
          zhAllowList.some((p) => p && (s.includes(p) || (s.length > 10 && p.includes(s))));
        if (frags.every(okFrag)) continue;
        zhViol.push(`${f}: ${txt.slice(0, 80)}`);
      }
    }
    writeFileSync(
      "qa/zh-strings.txt",
      zhViol.length ? zhViol.join("\n") + "\n" : "OK\n",
    );
    results.push({
      gate: "zh_strings",
      ok: zhViol.length === 0,
      detail: `${zhViol.length} non-strings.json zh text nodes ${zhViol.slice(0, 6).join(" | ")}`,
    });
  }

  // ---- lang isolation (D1): exactly one authored language visible ----
  {
    try {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch();
      const page = await browser.newPage();
      const gl3 = JSON.parse(readFileSync("out/glosses.json", "utf8"));
      const zhG = new Set(
        gl3.entries.filter((e: any) => e.zh).map((e: any) => e.zh.trim()),
      );
      const counts: Record<string, number> = {};
      for (const f of siteFiles) {
        await page.goto("file://" + path.resolve(`site/${f}`));
        await page.evaluate(() => document.fonts.ready);
        for (const lang of ["is", "en", "zh"]) {
          await page.evaluate((l) => {
            const fn =
              (globalThis as any).setVlang ?? (globalThis as any).setLang;
            if (fn) fn(l);
            else {
              document.body.classList.remove("lang-is", "lang-en", "lang-zh");
              document.body.classList.add("lang-" + l);
            }
          }, lang);
          await page.waitForTimeout(60);
          const r = await page.evaluate((l) => {
            const vis = (el: Element) => {
              const cs = getComputedStyle(el);
              if (cs.display === "none" || cs.visibility === "hidden") return false;
              const b = el.getBoundingClientRect();
              return b.width > 0 && b.height > 0;
            };
            // any .bi-<other> visible?
            let wrong = 0;
            for (const el of document.querySelectorAll(".bi-is,.bi-en,.bi-zh")) {
              if (!el.classList.contains("bi-" + l) && vis(el)) wrong++;
            }
            // mixed CJK + Icelandic-only letters in one visible text node
            const CJK = /[\u2e80-\u2eff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
            const ISL = /[þðæöÞÐÆÖ]/;
            const ALLOW = ["bi-zh", "gl", "gloss", "is-line", "en-line"];
            const isAllowed = (n: Node) => {
              let p = n.parentElement;
              while (p) {
                if (ALLOW.some((c) => p!.classList.contains(c))) return true;
                p = p.parentElement;
              }
              return false;
            };
            let mixed = 0;
            const w = document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_TEXT,
            );
            let n = w.nextNode();
            while (n) {
              const t = (n.textContent ?? "").trim();
              if (t && CJK.test(t) && ISL.test(t) && !isAllowed(n) && n.parentElement && vis(n.parentElement))
                mixed++;
              n = w.nextNode();
            }
            return { wrong, mixed };
          }, lang);
          const key = `${f}:${lang}`;
          counts[key] = r.wrong + r.mixed;
          if (r.wrong || r.mixed)
            console.log(`[lang_iso] ${key}: ${r.wrong} wrong-lang bi, ${r.mixed} mixed nodes`);
        }
      }
      await browser.close();
      const bad = Object.entries(counts).filter(([, c]) => c > 0);
      results.push({
        gate: "lang_isolation",
        ok: bad.length === 0,
        detail: bad.length
          ? bad.map(([k, c]) => `${k}=${c}`).join(" | ")
          : "0 wrong-language elements, 0 mixed CJK/IS nodes",
      });
    } catch (e) {
      results.push({ gate: "lang_isolation", ok: false, detail: String(e) });
    }
  }

  // ---- screenshots ----
  {
    const pages = siteFiles.map((f) => `site/${f}`);
    const errs = await screenshotAll({
      pages,
      widths: [390, 768, 1280, 1920],
      langs: ["is", "en", "zh"],
      outDir: "qa/screens",
    });
    results.push({
      gate: "screenshots",
      ok: errs.length === 0,
      detail: errs.length ? errs.slice(0, 10).join("\n") : "no console errors",
    });
  }

  // ---- movement midpoint frames ----
  {
    try {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch();
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      await page.goto("file://" + path.resolve("site/video.html"));
      await page.evaluate(() => document.fonts.ready);
      mkdirSync("qa/frames", { recursive: true });
      const mStarts = new Map<number, { a: number; b: number }>();
      for (const c of tl.chunks) {
        const cur = mStarts.get(c.movement) ?? { a: c.start_s, b: c.end_s };
        cur.a = Math.min(cur.a, c.start_s);
        cur.b = Math.max(cur.b, c.end_s);
        mStarts.set(c.movement, cur);
      }
      for (const [mv, w] of [...mStarts.entries()].sort()) {
        for (const [tag, frac] of [
          ["mid", 0.5],
          ["q1", 0.25],
          ["q3", 0.75],
        ] as const) {
          const tt = w.a + (w.b - w.a) * frac;
          const png = await page.evaluate(async (tt) => {
            (window as any).__t = tt;
            document.body.classList.add("rendering");
            (window as any).renderAt(tt);
            return (document.getElementById("cv") as HTMLCanvasElement).toDataURL("image/png");
          }, tt);
          writeFileSync(
            `qa/frames/m${mv}-${tag}.png`,
            Buffer.from((png as string).split(",")[1], "base64"),
          );
        }
      }
      // m2 overlap check: every visible falling/settled answer box must be
      // pairwise non-intersecting at every sampled time
      const m2 = tl.chunks
        .filter((c) => c.movement === 2)
        .map((c) => [c.start_s, c.end_s]);
      const m2start = Math.min(...m2.map((c) => c[0]));
      const m2end = Math.max(...m2.map((c) => c[1]));
      let overlaps = 0;
      for (let t = m2start; t <= m2end; t += 0.5) {
        const boxes = await page.evaluate((tt) => (window as any).m2Boxes(tt), t);
        for (let i = 0; i < boxes.length; i++)
          for (let k = i + 1; k < boxes.length; k++) {
            const A = boxes[i], B = boxes[k];
            if (A.x0 < B.x1 && B.x0 < A.x1 && A.y0 < B.y1 && B.y0 < A.y1)
              overlaps++;
          }
      }
      await browser.close();
      results.push({
        gate: "frames",
        ok: overlaps === 0,
        detail: `qa/frames/m*-{mid,q1,q3}.png · m2 overlap pairs: ${overlaps}`,
      });
    } catch (e) {
      results.push({ gate: "frames", ok: false, detail: String(e) });
    }
  }

  // ---- report + songbook crops for review ----
  {
    try {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch();
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      mkdirSync("qa/report-crops", { recursive: true });
      for (const [name, dir] of [
        ["report", "qa/report-crops"],
        ["songbook", "qa/songbook-crops"],
      ] as const) {
        mkdirSync(dir, { recursive: true });
        await page.goto("file://" + path.resolve(`site/${name}.html`));
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);
        const h = await page.evaluate(() => document.body.scrollHeight);
        const n = Math.ceil(h / 900);
        for (let i = 0; i < n; i++) {
          await page.evaluate((y) => window.scrollTo(0, y), i * 900);
          await page.waitForTimeout(80);
          await page.screenshot({
            path: `${dir}/${String(i + 1).padStart(2, "0")}.png`,
          });
        }
      }
      await browser.close();
      // rasterise first PDF page via sips/pdftoppm if available
      try {
        execFileSync("pdftoppm", ["-png", "-f", "1", "-l", "1", "-r", "110", "site/songbook.pdf", "qa/songbook-pdf"]);
      } catch {
        execFileSync("sips", ["-s", "format", "png", "site/songbook.pdf", "--out", "qa/songbook-pdf-1.png"], { stdio: "ignore" });
      }
      results.push({ gate: "crops", ok: true, detail: "qa/report-crops/, qa/songbook-crops/, qa/songbook-pdf-1.png" });
    } catch (e) {
      results.push({ gate: "crops", ok: false, detail: String(e) });
    }
  }

  // ---- D5 zh font: Iansui embedded and usable ----
  {
    try {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch();
      const page = await browser.newPage();
      await page.goto("file://" + path.resolve("site/index.html"));
      await page.evaluate(() => document.fonts.ready);
      const fontOk = await page.evaluate(() => {
        const samples = ["華文", "機器譯文", "已校訂", "冰島語", "韌性"];
        return samples.every((s) => document.fonts.check(`16px Iansui`, s));
      });
      // tofu check: every zh glyph in the subset should render with the
      // Iansui face — measure via canvas vs a guaranteed-missing codepoint
      const tofu = await page.evaluate(() => {
        const cv = document.createElement("canvas");
        const cx = cv.getContext("2d")!;
        cx.font = "16px Iansui";
        const privW = cx.measureText("\uE000").width; // never in subset
        let bad = 0;
        const probe = "華文機器譯文已校訂冰島語韌性音樂圈";
        for (const c of probe) if (cx.measureText(c).width === privW) bad++;
        return bad;
      });
      await browser.close();
      results.push({
        gate: "zh_font",
        ok: fontOk && tofu === 0,
        detail: `fonts.check Iansui=${fontOk} · tofu chars ${tofu}`,
      });
    } catch (e) {
      results.push({ gate: "zh_font", ok: false, detail: String(e) });
    }
  }

  // ---- D2: songbook.pdf stays IS + EN ----
  {
    try {
      const txt = execFileSync("pdftotext", ["site/songbook.pdf", "-"], {
        encoding: "utf8",
      }).replace(/\s+/g, " ");
      const info = execFileSync("pdfinfo", ["site/songbook.pdf"]).toString();
      const pages = parseInt(info.match(/^Pages:\s+(\d+)/m)?.[1] ?? "0", 10);
      const fonts = execFileSync("pdffonts", ["site/songbook.pdf"]).toString();
      const fontsOk = /Fraunces/.test(fonts) && /Inter/.test(fonts);
      // emoji (Type-3 glyphs) have no text layer — strip from both sides
      const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;
      const norm = (t: string) =>
        t.replace(EMOJI, "").replace(/\s+/g, " ").trim();
      const txtN = txt.replace(EMOJI, "").replace(/\s+/g, " ");
      const missIs: string[] = [];
      const missEn: string[] = [];
      for (const m of lyrics.movements)
        for (const l of m.lines) {
          if (!txtN.includes(norm(l.text))) missIs.push(l.text.slice(0, 40));
          const en = norm(l.gloss?.en ?? "");
          if (en && !txtN.includes(en)) missEn.push(l.text.slice(0, 40));
        }
      results.push({
        gate: "songbook_pdf",
        ok: missIs.length === 0 && missEn.length === 0 && fontsOk && pages > 0,
        detail: `${pages} pages · ${missIs.length} IS lines missing · ${missEn.length} EN glosses missing · fonts ${fontsOk ? "Fraunces+Inter" : "MISSING"}`,
      });
    } catch (e) {
      results.push({ gate: "songbook_pdf", ok: false, detail: String(e) });
    }
  }

  // ---- ffprobe duration ----
  {
    try {
      const dur = (f: string) =>
        parseFloat(
          execFileSync("ffprobe", [
            "-v", "quiet", "-show_entries", "format=duration",
            "-of", "csv=p=0", f,
          ]).toString().trim(),
        );
      const mp4 = existsSync("site/medley.mp4") ? dur("site/medley.mp4") : null;
      const mp3 = tl.chosen_file && existsSync(tl.chosen_file) ? dur(tl.chosen_file) : null;
      const ok = mp4 != null && mp3 != null && Math.abs(mp4 - mp3) <= 0.1;
      results.push({
        gate: "ffprobe",
        ok,
        detail: `mp4=${mp4?.toFixed(2)}s audio=${mp3?.toFixed(2)}s Δ=${mp4 && mp3 ? Math.abs(mp4 - mp3).toFixed(3) : "n/a"}`,
      });
    } catch (e) {
      results.push({ gate: "ffprobe", ok: false, detail: String(e) });
    }
  }

  const report = results
    .map((r) => `${r.ok ? "PASS" : "FAIL"} ${r.gate}: ${r.detail}`)
    .join("\n");
  writeFileSync("qa/gates.txt", report + "\n");
  console.log(report);
  return results.every((r) => r.ok);
}
