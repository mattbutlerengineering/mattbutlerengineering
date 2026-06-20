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

interface RequestRecord {
  readonly timestamp: number;
  readonly isError: boolean;
}

export interface EndpointErrorRate {
  readonly endpoint: string;
  readonly total: number;
  readonly errors: number;
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

function createErrorRateTracker() {
  const records = new Map<string, RequestRecord[]>();

  function record(endpoint: string, statusCode: number): void {
    const entry: RequestRecord = {
      timestamp: Date.now(),
      isError: statusCode >= 400,
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
      const errors = entries.filter((r) => r.isError).length;
      const rate = total > 0 ? errors / total : 0;

      endpoints.push({ endpoint, total, errors, rate: Math.round(rate * 1000) / 1000 });

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

function normalizeRoute(request: FastifyRequest): string {
  // Use the route pattern (e.g., "/api/v1/users/:id") not the actual URL
  const routeUrl = (request.routeOptions as { url?: string })?.url ?? request.url.split("?")[0];
  return routeUrl;
}

async function errorRatePlugin(fastify: FastifyInstance): Promise<void> {
  const tracker = createErrorRateTracker();

  fastify.addHook("onResponse", async (request: FastifyRequest, reply: FastifyReply) => {
    const route = normalizeRoute(request);

    // Skip health/docs endpoints
    if (IGNORED_PATHS.has(route) || route.startsWith("/docs")) return;

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
