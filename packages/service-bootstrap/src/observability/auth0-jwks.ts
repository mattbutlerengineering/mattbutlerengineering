/**
 * The one home for Auth0 JWKS knowledge shared by `/health` and `/ready`:
 * the dev-tenant fallback, the `AUTH_AUTHORITY` -> JWKS-URL contract, the
 * URL precedence, and the reachability probe.
 *
 * What stays with each caller is its *policy*: `/health` (service-bootstrap
 * `checkAuth0`) maps a probe result to a degraded/ok message with no retry;
 * `/ready` (`registerStandardChecks`) retries once and throws. See ADR-009.
 */

const DEV_AUTH0_JWKS_URL = "https://dev-ytbgmz5ls3wh4xdx.us.auth0.com/.well-known/jwks.json";

export const AUTH0_UNCONFIGURED_MESSAGE =
  "Auth0 JWKS not configured: set AUTH_AUTHORITY (or AUTH0_JWKS_URL)";

/**
 * Builds the Auth0 JWKS URL from an `AUTH_AUTHORITY` origin.
 *
 * Returns `undefined` when the authority is absent/empty (matching the
 * fail-closed auth gate, which treats an empty value as "not configured").
 * A single trailing slash is stripped so the JWKS path is never doubled.
 *
 * `@mbe/service-bootstrap` re-exports this from `validate-startup-config.ts`
 * for its own boot-time validation and readiness wiring.
 */
export function buildJwksUrl(authority: string | undefined): string | undefined {
  if (!authority) {
    return undefined;
  }
  return `${authority.replace(/\/$/, "")}/.well-known/jwks.json`;
}

/**
 * Resolves the JWKS URL to probe, in precedence order: `explicit`,
 * `AUTH0_JWKS_URL`, then the authority the service validates tokens against
 * (`AUTH_AUTHORITY`, via {@link buildJwksUrl}).
 *
 * The dev-tenant fallback is a local-development convenience and is refused
 * in production: probing it there reports on an endpoint the service does not
 * authenticate against, masking a missing `AUTH_AUTHORITY` behind a green
 * check (#4195). Returns `null` in that case so callers fail loudly.
 */
export function resolveJwksUrl(explicit?: string): string | null {
  const configured =
    explicit ?? process.env.AUTH0_JWKS_URL ?? buildJwksUrl(process.env.AUTH_AUTHORITY);
  if (configured) {
    return configured;
  }
  return process.env.NODE_ENV === "production" ? null : DEV_AUTH0_JWKS_URL;
}

export type JwksProbeResult =
  | { readonly kind: "ok"; readonly latency: number }
  | { readonly kind: "http"; readonly status: number; readonly latency: number }
  | { readonly kind: "timeout"; readonly error: unknown; readonly latency: number }
  | { readonly kind: "network"; readonly error: unknown; readonly latency: number };

export interface JwksProbeOptions {
  readonly timeoutMs: number;
  /** Defaults to a per-call lookup of global `fetch` so test stubs are honoured. */
  readonly fetchFn?: typeof fetch;
}

/**
 * Fetches the JWKS endpoint once. Never throws: every outcome is a result.
 * `error` on `timeout`/`network` is the original thrown value, so callers
 * that surface it keep the exact message.
 */
export async function probeJwks(url: string, options: JwksProbeOptions): Promise<JwksProbeResult> {
  const { timeoutMs, fetchFn = (...args: Parameters<typeof fetch>) => fetch(...args) } = options;
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, { signal: controller.signal });
    const latency = Date.now() - start;
    return response.ok
      ? { kind: "ok", latency }
      : { kind: "http", status: response.status, latency };
  } catch (error) {
    const latency = Date.now() - start;
    const aborted = error instanceof Error && error.name === "AbortError";
    return { kind: aborted ? "timeout" : "network", error, latency };
  } finally {
    clearTimeout(timer);
  }
}
