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

export const defaultSyncHttp: SyncHttp = (req) => {
  const out = execFileSync(process.execPath, ["-e", FETCH_BRIDGE_SCRIPT], {
    input: JSON.stringify(req),
    encoding: "utf-8",
    timeout: 15_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  return JSON.parse(out) as SyncHttpResponse;
};
