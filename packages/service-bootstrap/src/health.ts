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
 * Checks Auth0 JWKS endpoint reachability.
 *
 * Returns ok when the JWKS endpoint responds with 200 within timeout,
 * degraded otherwise (non-200, network error, or timeout).
 */
export async function checkAuth0(jwksUrl?: string): Promise<Auth0CheckResult> {
  const url = jwksUrl ?? process.env.AUTH0_JWKS_URL ?? DEV_AUTH0_JWKS_URL;
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
