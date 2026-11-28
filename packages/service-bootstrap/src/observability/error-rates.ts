import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyInstance {
    getErrorRates(): ErrorRateSnapshot;
  }
}

/**
 * Per-endpoint error rate tracking with a rolling 5-minute window.
 *
 * Registers a Fastify onResponse hook that tracks status codes per
 * route. Exposes error rates via `app.getErrorRates()` for inclusion
 * in health check responses.
 */

type RequestOutcome = "ok" | "server-error" | "client-error";

interface RequestRecord {
  readonly timestamp: number;
  readonly outcome: RequestOutcome;
}

export interface EndpointErrorRate {
  readonly endpoint: string;
  readonly total: number;
  /** Server errors (5xx) only. Drives `rate` and degradation. */
  readonly errors: number;
  /** Client errors (4xx except 408/429/499). Observable, never degrades. */
  readonly clientErrors: number;
  readonly rate: number;
}

export interface ErrorRateSnapshot {
  readonly endpoints: readonly EndpointErrorRate[];
  readonly degraded: boolean;
}

export interface ErrorRateHealthCheckResult {
  readonly status: "ok" | "degraded";
  readonly endpoints: readonly EndpointErrorRate[];
  readonly message?: string;
}

const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const DEGRADATION_THRESHOLD = 0.1; // 10% error rate
const IGNORED_PATHS = new Set(["/health", "/docs", "/reference"]);

// 408 (client timeout), 429 (the rate limiter working) and 499 (client closed
// the request) are not faults the service or the caller's input caused.
const NEUTRAL_CLIENT_STATUSES = new Set([408, 429, 499]);

function classify(statusCode: number): RequestOutcome {
  if (statusCode >= 500) return "server-error";
  if (statusCode >= 400 && !NEUTRAL_CLIENT_STATUSES.has(statusCode)) return "client-error";
  return "ok";
}

function createErrorRateTracker() {
  const records = new Map<string, RequestRecord[]>();

  function record(endpoint: string, statusCode: number): void {
    const entry: RequestRecord = {
      timestamp: Date.now(),
      outcome: classify(statusCode),
    };

    const existing = records.get(endpoint) ?? [];
    records.set(endpoint, [...existing, entry]);
  }

  function prune(): void {
    const cutoff = Date.now() - WINDOW_MS;
    for (const [endpoint, entries] of records) {
      const pruned = entries.filter((r) => r.timestamp >= cutoff);
      if (pruned.length === 0) {
        records.delete(endpoint);
      } else {
        records.set(endpoint, pruned);
      }
    }
  }

  function snapshot(): ErrorRateSnapshot {
    prune();

    const endpoints: EndpointErrorRate[] = [];
    let degraded = false;

    for (const [endpoint, entries] of records) {
      const total = entries.length;
      const errors = entries.filter((r) => r.outcome === "server-error").length;
      const clientErrors = entries.filter((r) => r.outcome === "client-error").length;
      const rate = total > 0 ? errors / total : 0;

      endpoints.push({
        endpoint,
        total,
        errors,
        clientErrors,
        rate: Math.round(rate * 1000) / 1000,
      });

      if (rate > DEGRADATION_THRESHOLD && total >= 5) {
        degraded = true;
      }
    }

    return {
      endpoints: endpoints.sort((a, b) => b.rate - a.rate),
      degraded,
    };
  }

  return { record, snapshot };
}

// The route pattern (e.g. "/api/v1/users/:id"), or undefined when the request
// matched no route. Unmatched 404s (scanners, the Sentry heartbeat's probe) are
// not an endpoint's error rate, so they must not mark the service degraded.
function normalizeRoute(request: FastifyRequest): string | undefined {
  return (request.routeOptions as { url?: string })?.url;
}

async function errorRatePlugin(fastify: FastifyInstance): Promise<void> {
  const tracker = createErrorRateTracker();

  fastify.addHook("onResponse", async (request: FastifyRequest, reply: FastifyReply) => {
    const route = normalizeRoute(request);

    // Skip unmatched routes and health/docs endpoints
    if (route === undefined || IGNORED_PATHS.has(route) || route.startsWith("/docs")) return;

    tracker.record(route, reply.statusCode);
  });

  fastify.decorate("getErrorRates", () => tracker.snapshot());
}

export const errorRatePlugin_ = fp(errorRatePlugin, {
  name: "error-rate-tracker",
  fastify: "5.x",
});

/**
 * Interprets an ErrorRateSnapshot as a health-check result.
 * Single owner for degradation judgement — callers do not re-implement thresholds.
 */
export function createErrorRateHealthCheck(
  snapshot: ErrorRateSnapshot
): ErrorRateHealthCheckResult {
  if (!snapshot.degraded) {
    return { status: "ok", endpoints: snapshot.endpoints };
  }

  const degradedEndpoints = snapshot.endpoints.filter(
    (e) => e.rate > DEGRADATION_THRESHOLD && e.total >= 5
  );
  const message = `High error rate on: ${degradedEndpoints.map((e) => `${e.endpoint} (${Math.round(e.rate * 100)}%)`).join(", ")}`;

  return { status: "degraded", endpoints: snapshot.endpoints, message };
}

export { createErrorRateTracker };
