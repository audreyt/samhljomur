// Model call layer: HTTP to local Ollama, sha-keyed cache, JSONL run logs,
// per-run manifest. Three modes:
//   live   - cache lookup first (resume), POST on miss, store response.
//   replay - cache only, never touches the network.
//   recall - always POST (for `rerun`); fresh responses go to runs/<id>/recall/.

import { createHash } from "node:crypto";
import { hostname } from "node:os";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import {
  BASE_URL,
  CLEF_DIGEST,
  CLEF_MODEL,
  GEMMA_DIGEST,
  GRANITE_DIGEST,
  KEEP_ALIVE,
  SNAPSHOT_DIR,
  TRANSLATORS,
  TranslatorCfg,
} from "./spec";

export type Mode = "live" | "replay" | "recall";
// translator/log namespaces are open-ended (B2: one line in spec.TRANSLATORS)
export type ModelKind = string;

export interface CallStats {
  live: number;
  cache: number;
  failures: number;
  retries: number;
}

export class CacheMiss extends Error {
  constructor(public sha: string, model: ModelKind) {
    super(`cache miss in replay mode: ${model}/${sha}`);
  }
}

export class RunCtx {
  mode: Mode;
  runId: string;
  runDir: string;
  stats: Record<ModelKind, CallStats> = {};
  stat(model: ModelKind): CallStats {
    if (!this.stats[model])
      this.stats[model] = { live: 0, cache: 0, failures: 0, retries: 0 };
    return this.stats[model];
  }
  failures: { model: ModelKind; sha: string; error: string }[] = [];

  constructor(mode: Mode) {
    this.mode = mode;
    const now = new Date();
    const stamp = now
      .toISOString()
      .replace(/[-:T]/g, "")
      .slice(0, 14);
    this.runId = `${stamp}-${Math.random().toString(36).slice(2, 6)}`;
    this.runDir = `runs/${this.runId}`;
    mkdirSync(this.runDir, { recursive: true });
    for (const m of ["clef", "elevenlabs", ...TRANSLATORS.map((t) => t.id)]) {
      mkdirSync(`cache/${m}`, { recursive: true });
    }
    this.writeManifestStart();
  }

  private logPath(model: ModelKind): string {
    return `${this.runDir}/${model}.jsonl`;
  }

  log(entry: object, model: ModelKind) {
    appendFileSync(this.logPath(model), JSON.stringify(entry) + "\n");
  }

  private writeManifestStart() {
    const snapshot: Record<string, string> = {};
    for (const f of readdirSync(SNAPSHOT_DIR).sort()) {
      if (!f.endsWith(".json")) continue;
      snapshot[f] = sha256hex(readFileSync(`${SNAPSHOT_DIR}/${f}`));
    }
    const manifest: Record<string, unknown> = {
      run_id: this.runId,
      mode: this.mode,
      hostname: hostname(),
      started_at: new Date().toISOString(),
      models: {
        clef: { name: CLEF_MODEL, digest_spec: CLEF_DIGEST },
        ...Object.fromEntries(
          TRANSLATORS.map((t) => [
            t.id,
            { name: t.model, api: t.api, url: t.url },
          ]),
        ),
      },
      snapshot_dir: SNAPSHOT_DIR,
      snapshot_sha256: snapshot,
    };
    if (this.mode !== "replay") {
      const DIGESTS: Record<string, string> = {
        granite: GRANITE_DIGEST,
        gemma: GEMMA_DIGEST,
      };
      const probe = (t: (typeof TRANSLATORS)[number]) =>
        t.api === "ollama-chat"
          ? probeModel(t.model, DIGESTS[t.id] ?? "")
          : { name: t.model, api: t.api, url: t.url, probe: "mlx_lm.server" };
      manifest.models = {
        clef: probeModel(CLEF_MODEL, CLEF_DIGEST),
        ...Object.fromEntries(TRANSLATORS.map((t) => [t.id, probe(t)])),
      };
    }
    writeFileSync(
      `${this.runDir}/manifest.json`,
      JSON.stringify(manifest, null, 2) + "\n",
    );
  }

  finishManifest(command: string) {
    const p = `${this.runDir}/manifest.json`;
    const m = JSON.parse(readFileSync(p, "utf8"));
    m.command = command;
    m.finished_at = new Date().toISOString();
    m.calls = this.stats;
    m.failures = this.failures;
    writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
  }
}

function probeModel(name: string, specDigest: string) {
  const out: Record<string, unknown> = {
    name,
    digest_spec: specDigest,
  };
  try {
    const tags = JSON.parse(
      execFileSync("curl", ["-s", `${BASE_URL}/api/tags`], {
        timeout: 10000,
      }).toString(),
    );
    const hit = (tags.models || []).find(
      (m: { name: string }) => m.name === `${name}:latest` || m.name === name,
    );
    if (hit) out.digest_seen = hit.digest;
    out.digest_match = String(hit?.digest || "").startsWith(specDigest);
  } catch (e) {
    out.probe_error = String(e);
  }
  try {
    const tagged = name.includes(":") ? name : `${name}:latest`;
    out.ollama_show = execFileSync("ollama", ["show", tagged], {
      timeout: 10000,
    })
      .toString()
      .slice(0, 4000);
  } catch {
    /* ollama cli not required */
  }
  return out;
}

export function sha256hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function cacheFile(model: ModelKind, sha: string): string {
  return `cache/${model}/${sha}.json`;
}

function readCache(model: ModelKind, sha: string): { response: unknown; latency_ms: number } | null {
  const f = cacheFile(model, sha);
  if (!existsSync(f)) return null;
  const e = JSON.parse(readFileSync(f, "utf8"));
  return { response: e.response, latency_ms: e.latency_ms ?? 0 };
}

function writeCache(
  model: ModelKind,
  sha: string,
  body: object,
  response: unknown,
  latency_ms = 0,
) {
  writeFileSync(
    cacheFile(model, sha),
    JSON.stringify({ request: body, response, latency_ms }, null, 2) + "\n",
  );
}

async function post(url: string, bodyJson: string): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bodyJson,
    signal: AbortSignal.timeout(600_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${detail.slice(0, 500)}`);
  }
  return res.json();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One HTTP call with sha-keyed cache and run logging.
export interface CallResult {
  response: unknown;
  ms: number; // live latency or the latency stored in the cache entry
}
export async function call(
  ctx: RunCtx,
  model: ModelKind,
  url: string,
  body: Record<string, unknown>,
  label = "",
): Promise<CallResult> {
  const bodyJson = JSON.stringify(body);
  const sha = sha256hex(bodyJson);
  const st = ctx.stat(model);

  if (ctx.mode !== "recall") {
    const hit = readCache(model, sha);
    if (hit !== null) {
      st.cache++;
      ctx.log(
        {
          t: new Date().toISOString(),
          model,
          sha,
          via: "cache",
          label,
          request: body,
          response: hit.response,
        },
        model,
      );
      return { response: hit.response, ms: hit.latency_ms };
    }
  }
  if (ctx.mode === "replay") throw new CacheMiss(sha, model);

  const t0 = Date.now();
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      st.retries++;
      await sleep(2000 * attempt * attempt);
    }
    try {
      const response = await post(url, bodyJson);
      const t1 = Date.now();
      st.live++;
      ctx.log(
        {
          t0: new Date(t0).toISOString(),
          t1: new Date(t1).toISOString(),
          latency_ms: t1 - t0,
          model,
          sha,
          via: ctx.mode === "recall" ? "recall" : "live",
          attempt,
          label,
          request: body,
          response,
        },
        model,
      );
      if (ctx.mode === "live")
        writeCache(model, sha, body, response, t1 - t0);
      if (ctx.mode === "recall") {
        const prior = readCache(model, sha);
        writeFileSync(
          `${ctx.runDir}/recall-${model}-${sha}.json`,
          JSON.stringify(
            { request: body, cached_response: prior?.response ?? null, fresh_response: response },
            null,
            2,
          ) + "\n",
        );
      }
      return { response, ms: t1 - t0 };
    } catch (e) {
      lastErr = e;
    }
  }
  st.failures++;
  const error = String(lastErr);
  ctx.failures.push({ model, sha, error });
  ctx.log(
    {
      t: new Date().toISOString(),
      model,
      sha,
      via: ctx.mode,
      ok: false,
      label,
      request: body,
      error,
    },
    model,
  );
  throw new Error(`model call failed after retries (${model}, ${label}): ${error}`);
}

// ---- Clef ----

export interface ClefAnswers {
  [id: string]: Record<string, unknown>;
}

export async function clef(
  ctx: RunCtx,
  state: string,
  questions: Record<string, unknown>,
  label = "",
): Promise<{ answers: ClefAnswers; sha: string }> {
  const body = {
    model: CLEF_MODEL,
    state,
    questions,
    keep_alive: KEEP_ALIVE,
  };
  const sha = sha256hex(JSON.stringify(body));
  const { response: resp } = await call(
    ctx,
    "clef",
    `${BASE_URL}/v1/systemone`,
    body,
    label,
  );
  const answers = (resp as { answers?: ClefAnswers })?.answers;
  if (!answers) {
    throw new Error(`clef: malformed response for ${label}`);
  }
  return { answers, sha };
}

// ---- translator chat (ollama /api/chat or openai /v1/chat/completions) ----

export async function chat(
  ctx: RunCtx,
  cfg: TranslatorCfg,
  system: string,
  user: string,
  options: Record<string, unknown>,
  label = "",
): Promise<{ text: string; sha: string; ms: number }> {
  const body =
    cfg.api === "ollama-chat"
      ? {
          model: cfg.model,
          stream: false,
          think: false,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          options,
          keep_alive: KEEP_ALIVE,
        }
      : {
          model: cfg.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          ...options,
        };
  const sha = sha256hex(JSON.stringify(body));
  const { response: resp, ms } = await call(ctx, cfg.id, cfg.url, body, label);
  const text =
    cfg.api === "ollama-chat"
      ? (resp as { message?: { content?: string } })?.message?.content
      : (resp as { choices?: { message?: { content?: string } }[] })
          ?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error(`${cfg.id}: malformed response for ${label}`);
  }
  return { text: text.trim(), sha, ms };
}

// ---- ElevenLabs (binary responses, e.g. music mp3) ----

export interface BinaryCallResult {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  sha: string;
  fromCache: boolean;
}

// Binary calls are cached as cache/elevenlabs/<sha>.json {request, meta{headers,
// status, body_file, body_sha256}} with the payload bytes under body_file.
export async function elCall(
  ctx: RunCtx,
  url: string,
  body: Record<string, unknown> | Buffer,
  bodyFile: string,
  headers: Record<string, string> = {},
  isForm = false,
  label = "",
): Promise<BinaryCallResult> {
  const bodyBytes = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  const reqForSha = isForm
    ? { url, multipart: true, body_sha256: sha256hex(bodyBytes), headers: maskAuth(headers) }
    : { url, json: body, headers: maskAuth(headers) };
  const sha = sha256hex(JSON.stringify(reqForSha));

  if (ctx.mode !== "recall") {
    // elevenlabs entries store {request, response:{meta:{status, headers,
    // body_file...}}} — the meta lives under .response
    const cf = cacheFile("elevenlabs", sha);
    const hit = existsSync(cf)
      ? (JSON.parse(readFileSync(cf, "utf8")) as {
          response: { meta: { status: number; headers: Record<string, string>; body_file: string; body_sha256: string } };
        })
      : null;
    if (hit) {
      const meta = hit.response.meta;
      const bf = meta.body_file;
      if (!existsSync(bf)) throw new CacheMiss(sha, "elevenlabs");
      const bytes = readFileSync(bf);
      if (sha256hex(bytes) !== meta.body_sha256)
        throw new Error(`cache body hash mismatch: ${bf}`);
      ctx.stat("elevenlabs").cache++;
      ctx.log(
        { t: new Date().toISOString(), model: "elevenlabs", sha, via: "cache", label, request: reqForSha, meta },
        "elevenlabs",
      );
      return { status: meta.status, headers: meta.headers, body: bytes, sha, fromCache: true };
    }
  }
  if (ctx.mode === "replay") throw new CacheMiss(sha, "elevenlabs");

  const t0 = Date.now();
  const reqHeaders: Record<string, string> = { ...headers };
  if (!isForm) reqHeaders["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method: "POST",
    headers: reqHeaders,
    body: new Uint8Array(bodyBytes),
    signal: AbortSignal.timeout(600_000),
  });
  const bytes = Buffer.from(await res.arrayBuffer());
  const resHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => (resHeaders[k] = v));
  const t1 = Date.now();
  ctx.stat("elevenlabs").live++;
  ctx.log(
    {
      t0: new Date(t0).toISOString(),
      t1: new Date(t1).toISOString(),
      latency_ms: t1 - t0,
      model: "elevenlabs",
      sha,
      via: "live",
      label,
      request: reqForSha,
      status: res.status,
      response_headers: resHeaders,
      body_bytes: bytes.length,
    },
    "elevenlabs",
  );
  if (!res.ok) {
    const err = new Error(
      `ElevenLabs ${res.status}: ${bytes.toString("utf8").slice(0, 800)}`,
    );
    (err as any).status = res.status;
    (err as any).body = bytes.toString("utf8");
    throw err;
  }
  mkdirSync(bodyFile.split("/").slice(0, -1).join("/"), { recursive: true });
  writeFileSync(bodyFile, bytes);
  const meta = {
    status: res.status,
    headers: resHeaders,
    body_file: bodyFile,
    body_sha256: sha256hex(bytes),
  };
  writeCache("elevenlabs", sha, reqForSha as object, { meta });
  return { status: res.status, headers: resHeaders, body: bytes, sha, fromCache: false };
}

function maskAuth(h: Record<string, string>): Record<string, string> {
  const out = { ...h };
  for (const k of Object.keys(out))
    if (k.toLowerCase().includes("key") || k.toLowerCase().includes("auth"))
      out[k] = "***";
  return out;
}
