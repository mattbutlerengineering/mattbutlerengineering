import { execFileSync } from "node:child_process";

export interface SyncHttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface SyncHttpResponse {
  /** 0 means the request never reached a server (DNS/network failure). */
  status: number;
  body: string;
}

export type SyncHttp = (req: SyncHttpRequest) => SyncHttpResponse;

/**
 * `@mbe/gh-client`'s public API is synchronous (it wraps `execFileSync`, and
 * every caller across `scripts/*.mjs` calls it that way — see #3689). Node has
 * no synchronous `fetch`. Rather than making the whole client async (a caller
 * signature change the issue rules out) or shelling out to `curl` (a new
 * runtime dependency), this spawns the current Node binary itself — already
 * present, nothing new to install — as a short-lived subprocess that performs
 * one `fetch` and prints the result. `execFileSync` then blocks the parent
 * synchronously on that subprocess, the same way it already blocks on `gh`.
 * The request travels via stdin (not argv), so there is no argv-length limit
 * and no shell-escaping surface.
 *
 * `--no-warnings` + `NODE_USE_ENV_PROXY=1` (#4044): Node's global `fetch`
 * does NOT honor `HTTP_PROXY`/`HTTPS_PROXY` by default — it opens a direct
 * connection regardless of those env vars. In a Claude Code Remote/scheduled
 * session, outbound HTTPS is routed through a pre-configured agent proxy;
 * a direct connection reaches GitHub with a credential that's valid for
 * git-over-HTTPS but rejected by the raw REST API (401 `GhAuthError`, #3937),
 * while the *same* credential, routed through the configured proxy, is
 * accepted. `NODE_USE_ENV_PROXY=1` turns on Node's built-in (still
 * experimental — hence `--no-warnings` to keep stdout/stderr clean of the
 * `EnvHttpProxyAgent` notice) support for those env vars. Verified end to
 * end: this exact bridge, unchanged otherwise, went from a hard 401 to a
 * real 200 with actual PR data once this was added. Outside a proxied
 * session (plain local dev, CI) `HTTP_PROXY`/`HTTPS_PROXY` are unset, so
 * this is a no-op — behavior is unchanged there.
 */
const FETCH_BRIDGE_SCRIPT = `
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", async () => {
  const req = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  try {
    const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
    const body = await res.text();
    process.stdout.write(JSON.stringify({ status: res.status, body }));
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    process.stdout.write(JSON.stringify({ status: 0, body: message }));
  }
});
`;

/** Signature-compatible with execFileSync, for injection in tests. */
export type SyncExecFn = (
  cmd: string,
  args: string[],
  opts: {
    input: string;
    encoding: "utf-8";
    timeout: number;
    maxBuffer: number;
    env: NodeJS.ProcessEnv;
  }
) => string;

export interface SyncHttpOptions {
  /** Injected exec function — defaults to node's execFileSync. Production callers should never pass one (mirrors exec-runner.ts's `runner` option). */
  exec?: SyncExecFn;
}

export function createSyncHttp(opts: SyncHttpOptions = {}): SyncHttp {
  const exec = opts.exec ?? (execFileSync as SyncExecFn);

  return (req) => {
    const out = exec(process.execPath, ["--no-warnings", "-e", FETCH_BRIDGE_SCRIPT], {
      input: JSON.stringify(req),
      encoding: "utf-8",
      timeout: 15_000,
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, NODE_USE_ENV_PROXY: "1" },
    });
    return JSON.parse(out) as SyncHttpResponse;
  };
}

export const defaultSyncHttp: SyncHttp = createSyncHttp();
