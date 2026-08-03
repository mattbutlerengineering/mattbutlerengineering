import type { SyncHttp } from "./sync-http.js";

export interface RestContext {
  token: string;
  owner: string;
  repo: string;
  http: SyncHttp;
}

export interface RestResult {
  status: number;
  /** Parsed JSON body, or `null` for an empty (e.g. 204) response. */
  json: unknown;
}

export interface ApiRequestOptions {
  /** Status codes treated as success (e.g. 404 on an idempotent label-remove DELETE). */
  ignoreStatuses?: number[];
}

/**
 * Issues one GitHub REST (or Search) API call and parses the JSON envelope.
 * `path` may be a full URL (Search API) or a `/repos/...`-style path.
 */
export function apiRequest(
  ctx: RestContext,
  method: string,
  path: string,
  body?: unknown,
  opts: ApiRequestOptions = {}
): RestResult {
  const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${ctx.token}`,
    "user-agent": "mbe-gh-client",
  };
  if (body !== undefined) headers["content-type"] = "application/json";

  const res = ctx.http({
    method,
    url,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 0) {
    throw new Error(
      `gh-client REST request failed (network error): ${method} ${path}: ${res.body}`
    );
  }
  if (res.status >= 400 && !(opts.ignoreStatuses ?? []).includes(res.status)) {
    throw new Error(
      `gh-client REST request failed: ${method} ${path} -> ${res.status}: ${res.body}`
    );
  }

  return { status: res.status, json: res.body ? JSON.parse(res.body) : null };
}
