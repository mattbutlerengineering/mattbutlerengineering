import type { SyncHttp } from "./sync-http.js";

export interface RestContext {
  token: string;
  owner: string;
  repo: string;
  http: SyncHttp;
}

/**
 * Thrown when GitHub REST returns 401, or 403 for a reason other than
 * throttling — the token is present but not accepted for direct API access. In
 * a Claude Code Remote session `GITHUB_TOKEN`/`GH_TOKEN` is scoped for
 * git-over-HTTPS only (see #3937), so this is a distinguishable capability
 * gap, not "no data". Callers should check for this specifically instead of
 * losing the distinction inside a generic try/catch.
 */
export class GhAuthError extends Error {
  readonly status: number;

  constructor(method: string, path: string, status: number, body: string) {
    super(`gh-client REST auth failed: ${method} ${path} -> ${status}: ${body}`);
    this.name = "GhAuthError";
    this.status = status;
  }
}

/**
 * Thrown when GitHub REST returns 403 specifically because the caller is
 * being throttled — primary rate limit, secondary rate limit, or abuse
 * detection — detected by sniffing `res.body` for GitHub's wording for each
 * (see #3947, widened in #3953 — `SyncHttpResponse` doesn't capture headers,
 * so `x-ratelimit-remaining`/`retry-after` aren't reachable here). All three
 * are the same shape: a valid credential told to back off and retry later,
 * not an invalid one, so none of them must be reported as a
 * {@link GhAuthError}.
 */
export class GhRateLimitError extends Error {
  readonly status: number;

  constructor(method: string, path: string, status: number, body: string) {
    super(`gh-client REST rate limit exceeded: ${method} ${path} -> ${status}: ${body}`);
    this.name = "GhRateLimitError";
    this.status = status;
  }
}

/**
 * GitHub's primary and secondary rate-limit 403 bodies both say "rate
 * limit"; its abuse-detection 403 body says "abuse detection mechanism"
 * instead (#3953). All three are throttling, not a credential problem.
 */
function isThrottledBody(body: string): boolean {
  return /rate limit/i.test(body) || /abuse detection/i.test(body);
}

/**
 * Human-readable reason for a caught gh-client error, for scripts to log
 * alongside "query failed" instead of silently swallowing it. Distinguishes
 * the rate-limit gap ({@link GhRateLimitError}) and the auth-capability gap
 * ({@link GhAuthError}) from each other and from any other failure.
 */
export function describeGhError(err: unknown): string {
  if (err instanceof GhRateLimitError) {
    return `GitHub API rate limit exceeded (${err.status}) — REST fallback credential is valid but throttled, retry later`;
  }
  if (err instanceof GhAuthError) {
    return `GitHub auth failed (${err.status}) — REST fallback credential is not valid for direct API calls`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
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
    if (res.status === 403 && isThrottledBody(res.body)) {
      throw new GhRateLimitError(method, path, res.status, res.body);
    }
    if (res.status === 401 || res.status === 403) {
      throw new GhAuthError(method, path, res.status, res.body);
    }
    throw new Error(
      `gh-client REST request failed: ${method} ${path} -> ${res.status}: ${res.body}`
    );
  }

  return { status: res.status, json: res.body ? JSON.parse(res.body) : null };
}
