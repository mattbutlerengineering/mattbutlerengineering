import { buildJwksUrl } from "./validate-startup-config.js";

const DEV_AUTH0_JWKS_URL = "https://dev-ytbgmz5ls3wh4xdx.us.auth0.com/.well-known/jwks.json";
const AUTH0_TIMEOUT_MS = 2000;
const LATENCY_WINDOW = 100;
const LATENCY_ANOMALY_THRESHOLD = 3;

export interface LatencyAnomalyResult {
  readonly isAnomaly: boolean;
  readonly rollingAvg: number;
}

export interface LatencyTracker {
  readonly record: (ms: number) => void;
  readonly checkAnomaly: (currentMs: number) => LatencyAnomalyResult;
}

export interface Auth0CheckResult {
  readonly status: "ok" | "degraded";
  readonly latency: number;
  readonly message?: string;
}

/**
 * Creates an isolated latency tracker instance.
 *
 * Tracks a rolling window of DB latency measurements and detects anomalies
 * when the current latency exceeds 3x the rolling average.
 *
 * Each service gets its own tracker instance — no shared mutable state.
 */
export function createLatencyTracker(): LatencyTracker {
  const history: number[] = [];

  function record(ms: number): void {
    history.push(ms);
    if (history.length > LATENCY_WINDOW) {
      history.shift();
    }
  }

  function checkAnomaly(currentMs: number): LatencyAnomalyResult {
    if (history.length < 5) {
      return { isAnomaly: false, rollingAvg: 0 };
    }
    const sum = history.reduce((a, b) => a + b, 0);
    const rollingAvg = sum / history.length;
    return {
      isAnomaly: rollingAvg > 0 && currentMs > LATENCY_ANOMALY_THRESHOLD * rollingAvg,
      rollingAvg: Math.round(rollingAvg),
    };
  }

  return { record, checkAnomaly };
}

/**
 * Resolves the JWKS URL the health probe should check, in precedence order:
 * explicit argument, `AUTH0_JWKS_URL`, then the authority the service actually
 * validates tokens against (`AUTH_AUTHORITY`, via the shared
 * {@link buildJwksUrl} contract — see validate-startup-config.ts).
 *
 * The dev-tenant fallback is a local-development convenience and is refused in
 * production: probing a hardcoded dev tenant there reports on an endpoint the
 * service does not authenticate against, so /health could read "ok" while the
 * real authority was unreachable. Returns `null` in that case so the caller
 * degrades loudly instead.
 */
function resolveJwksUrl(jwksUrl?: string): string | null {
  const configured =
    jwksUrl ?? process.env.AUTH0_JWKS_URL ?? buildJwksUrl(process.env.AUTH_AUTHORITY);
  if (configured) {
    return configured;
  }
  return process.env.NODE_ENV === "production" ? null : DEV_AUTH0_JWKS_URL;
}

/**
 * Checks Auth0 JWKS endpoint reachability.
 *
 * Returns ok when the JWKS endpoint responds with 200 within timeout,
 * degraded otherwise (non-200, network error, timeout, or — in production —
 * no configured authority to probe).
 */
export async function checkAuth0(jwksUrl?: string): Promise<Auth0CheckResult> {
  const url = resolveJwksUrl(jwksUrl);
  if (url === null) {
    return {
      status: "degraded",
      latency: 0,
      message: "Auth0 JWKS not configured: set AUTH_AUTHORITY (or AUTH0_JWKS_URL)",
    };
  }
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AUTH0_TIMEOUT_MS);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const latency = Date.now() - start;
    if (!response.ok) {
      return { status: "degraded", latency, message: `Auth0 JWKS returned ${response.status}` };
    }
    return { status: "ok", latency };
  } catch (error) {
    const latency = Date.now() - start;
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Auth0 JWKS unreachable (timeout >2s)"
        : `Auth0 JWKS unreachable: ${error instanceof Error ? error.message : String(error)}`;
    return { status: "degraded", latency, message };
  }
}
