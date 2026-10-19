import { AUTH0_UNCONFIGURED_MESSAGE, probeJwks, resolveJwksUrl } from "@mbe/observability";

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
 * degraded otherwise (non-200, network error, timeout, or — in production —
 * no configured authority to probe).
 */
export async function checkAuth0(jwksUrl?: string): Promise<Auth0CheckResult> {
  const url = resolveJwksUrl(jwksUrl);
  if (url === null) {
    return { status: "degraded", latency: 0, message: AUTH0_UNCONFIGURED_MESSAGE };
  }
  const result = await probeJwks(url, { timeoutMs: AUTH0_TIMEOUT_MS });
  switch (result.kind) {
    case "ok":
      return { status: "ok", latency: result.latency };
    case "http":
      return {
        status: "degraded",
        latency: result.latency,
        message: `Auth0 JWKS returned ${result.status}`,
      };
    case "timeout":
      return {
        status: "degraded",
        latency: result.latency,
        message: "Auth0 JWKS unreachable (timeout >2s)",
      };
    case "network":
      return {
        status: "degraded",
        latency: result.latency,
        message: `Auth0 JWKS unreachable: ${result.error instanceof Error ? result.error.message : String(result.error)}`,
      };
  }
}
