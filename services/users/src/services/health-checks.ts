const AUTH0_JWKS_URL = "https://dev-ytbgmz5ls3wh4xdx.us.auth0.com/.well-known/jwks.json";
const AUTH0_TIMEOUT_MS = 2000;
const LATENCY_WINDOW = 100;
const LATENCY_ANOMALY_THRESHOLD = 3;

const dbLatencyHistory: number[] = [];

export function recordDbLatency(ms: number): void {
  dbLatencyHistory.push(ms);
  if (dbLatencyHistory.length > LATENCY_WINDOW) {
    dbLatencyHistory.shift();
  }
}

export function checkLatencyAnomaly(currentMs: number): {
  isAnomaly: boolean;
  rollingAvg: number;
} {
  if (dbLatencyHistory.length < 5) {
    return { isAnomaly: false, rollingAvg: 0 };
  }
  const sum = dbLatencyHistory.reduce((a, b) => a + b, 0);
  const rollingAvg = sum / dbLatencyHistory.length;
  return {
    isAnomaly: rollingAvg > 0 && currentMs > LATENCY_ANOMALY_THRESHOLD * rollingAvg,
    rollingAvg: Math.round(rollingAvg),
  };
}

export async function checkAuth0(): Promise<{
  status: "ok" | "degraded";
  latency: number;
  message?: string;
}> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AUTH0_TIMEOUT_MS);
    const response = await fetch(AUTH0_JWKS_URL, { signal: controller.signal });
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
