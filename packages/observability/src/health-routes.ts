/**
 * Shared Fastify health route registration.
 *
 * Extracted from per-service health.ts files (identical across users, reservations, agent).
 * Each service calls `registerHealthRoutes(fastify, options)` instead of duplicating ~228 lines.
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RateLimitMonitor } from "./rate-limit-monitor.js";
import {
  checkAuth0 as defaultCheckAuth0,
  checkLatencyAnomaly as defaultCheckLatencyAnomaly,
  recordDbLatency as defaultRecordDbLatency,
} from "./health-checks.js";

/** Minimal Prisma-like interface needed for the DB ping check. */
export interface PrismaLike {
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
}

/** DB stat functions injected per-service (from @mbe/database createDatabase). */
export interface DbStatFunctions {
  getSlowQueryStats: () => { count5min: number; slowestMs: number };
  getPoolMetrics: () => {
    active: number;
    idle: number;
    busy: number;
    size: number;
    utilization: number;
    isDegraded: boolean;
  };
  getServiceStatus: () => string;
}

/** A single route path + Swagger operationId pair. */
export interface HealthRouteEntry {
  path: string;
  operationId: string;
}

/** Options for `registerHealthRoutes`. */
export interface HealthRouteOptions {
  /** Prisma client instance used for the DB ping (`SELECT 1`). */
  prisma: PrismaLike;
  /** DB stat functions from createDatabase(). */
  db: DbStatFunctions;
  /**
   * Routes to register. Each entry registers one GET route with the shared handler.
   * Typically 2–3 per service (e.g. `/health` + `/api/v1/users/health`).
   */
  routes: HealthRouteEntry[];
  /**
   * Override for Auth0 JWKS reachability check. Defaults to the shared implementation.
   * Primarily used in tests to avoid real network calls.
   */
  checkAuth0?: () => Promise<{ status: "ok" | "degraded"; latency: number; message?: string }>;
  /**
   * Override for DB latency anomaly detection. Defaults to the shared implementation.
   * Primarily used in tests.
   */
  checkLatencyAnomaly?: (currentMs: number) => { isAnomaly: boolean; rollingAvg: number };
  /**
   * Override for recording DB latency. Defaults to the shared implementation.
   * Primarily used in tests.
   */
  recordDbLatency?: (ms: number) => void;
}

const HEALTH_SCHEMA_BASE = {
  summary: "Service health check",
  tags: ["Health"],
  response: {
    200: {
      description: "Service health status",
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["ok", "degraded", "error"],
          description:
            "Overall service status: ok (all checks pass), degraded (some checks failing), error (critical failure)",
          example: "ok",
        },
        version: {
          type: "string",
          description: "Service version number",
          example: "1.0.0",
        },
        timestamp: {
          type: "string",
          format: "date-time",
          description: "ISO 8601 timestamp of the health check",
          example: "2024-01-15T10:30:00.000Z",
        },
        checks: {
          type: "object",
          description: "Individual health check results",
          additionalProperties: {
            type: "object",
            additionalProperties: true,
            properties: {
              status: {
                type: "string",
                enum: ["ok", "error", "degraded"],
                description: "Status of this specific check",
              },
              message: {
                type: "string",
                description: "Error message if check failed",
              },
              latency: {
                type: "number",
                description: "Response time in milliseconds",
              },
            },
          },
        },
        error_rates: {
          type: "object",
          description: "Per-endpoint error rates",
          properties: {
            degraded: { type: "boolean" },
            endpoints: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  endpoint: { type: "string" },
                  total: { type: "number" },
                  errors: { type: "number" },
                  rate: { type: "number" },
                },
              },
            },
          },
        },
      },
    },
    503: {
      description: "Service unavailable (critical health check failed)",
      type: "object",
      properties: {
        status: { type: "string", enum: ["error"] },
        version: { type: "string" },
        timestamp: { type: "string", format: "date-time" },
        checks: { type: "object" },
      },
    },
  },
};

/**
 * Register shared health check routes on a Fastify instance.
 *
 * Each route in `options.routes` is registered with:
 * - Rate limit: max 10/min (DB-intensive)
 * - Handler: DB ping, slow-query stats, Auth0 reachability, rate-limit snapshot, pool metrics, error rates
 *
 * @example
 * ```ts
 * // services/users/src/routes/health.ts
 * import { registerHealthRoutes } from "@mbe/observability";
 * import { prisma, getSlowQueryStats, getPoolMetrics, getServiceStatus } from "../services/database.js";
 *
 * export async function healthRoutes(fastify: FastifyInstance) {
 *   await registerHealthRoutes(fastify, {
 *     prisma,
 *     db: { getSlowQueryStats, getPoolMetrics, getServiceStatus },
 *     routes: [
 *       { path: "/health", operationId: "getHealth" },
 *       { path: "/api/v1/users/health", operationId: "getHealthApiUsers" },
 *     ],
 *   });
 * }
 * ```
 */
export async function registerHealthRoutes(
  fastify: FastifyInstance,
  options: HealthRouteOptions
): Promise<void> {
  const {
    prisma,
    db,
    routes,
    checkAuth0 = defaultCheckAuth0,
    checkLatencyAnomaly = defaultCheckLatencyAnomaly,
    recordDbLatency = defaultRecordDbLatency,
  } = options;

  const handler = async (request: FastifyRequest) => {
    const checks: Record<string, { status: string; latency?: number; message?: string }> = {};
    const { apiVersion, successorVersion, sunsetDate } = request.server as unknown as {
      apiVersion: string;
      successorVersion?: string;
      sunsetDate: string;
    };

    // DB ping
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      const dbLatency = Date.now() - dbStart;
      const anomaly = checkLatencyAnomaly(dbLatency);
      recordDbLatency(dbLatency);
      checks.database = {
        status: anomaly.isAnomaly ? "error" : "ok",
        latency: dbLatency,
        ...(anomaly.isAnomaly && {
          message: `Latency anomaly: ${dbLatency}ms vs rolling avg ${anomaly.rollingAvg}ms`,
        }),
      };
    } catch (error) {
      checks.database = {
        status: "error",
        message: error instanceof Error ? error.message : "Database connection failed",
        latency: Date.now() - dbStart,
      };
    }

    // Slow queries
    const slowQueries = db.getSlowQueryStats();
    const dbStatus = checks.database?.status ?? "ok";
    const slowQueryStatus = db.getServiceStatus();
    checks.slow_queries = {
      status: slowQueryStatus,
      message: `${slowQueries.count5min} slow queries in last 5min (slowest: ${slowQueries.slowestMs}ms)`,
      latency: slowQueries.slowestMs,
    };

    // Auth0
    const auth0Result = await checkAuth0();
    checks.auth0 = {
      status: auth0Result.status,
      latency: auth0Result.latency,
      ...(auth0Result.message && { message: auth0Result.message }),
    };

    // Rate limits
    const rateLimitMonitor = (request.server as unknown as { rateLimitMonitor: RateLimitMonitor })
      .rateLimitMonitor;
    const rateLimitSnapshot = rateLimitMonitor.getSnapshot();
    checks.rate_limits = {
      status: rateLimitSnapshot.isDegraded ? "degraded" : "ok",
      ...rateLimitSnapshot.stats,
      ...(rateLimitSnapshot.isDegraded && {
        message: `High rate limit activity: ${rateLimitSnapshot.stats.hits_last_hour} hits from ${rateLimitSnapshot.stats.blocked_ips} IPs`,
      }),
    };

    // Connection pool
    const poolMetrics = db.getPoolMetrics();
    (checks as Record<string, Record<string, unknown>>).pool = {
      status: poolMetrics.isDegraded ? "degraded" : "ok",
      ...(poolMetrics.isDegraded && {
        message: `Pool utilization high: ${Math.round(poolMetrics.utilization * 100)}% (${poolMetrics.busy}/${poolMetrics.size} busy)`,
      }),
      active: poolMetrics.active,
      idle: poolMetrics.idle,
      busy: poolMetrics.busy,
      size: poolMetrics.size,
      utilization: poolMetrics.utilization,
    };

    // Error rates
    const errorRates = fastify.getErrorRates();
    const degradedEndpoints = errorRates.endpoints.filter((e) => e.rate > 0.1 && e.total >= 5);

    const hasErrors =
      dbStatus === "error" ||
      slowQueryStatus === "degraded" ||
      auth0Result.status === "degraded" ||
      rateLimitSnapshot.isDegraded ||
      poolMetrics.isDegraded ||
      errorRates.degraded;

    return {
      status: hasErrors ? "degraded" : "ok",
      version: "1.0.0",
      apiVersion,
      successorVersion,
      sunsetDate,
      timestamp: new Date().toISOString(),
      checks,
      error_rates: errorRates,
      ...(errorRates.degraded && {
        message: `High error rate on: ${degradedEndpoints.map((e) => `${e.endpoint} (${Math.round(e.rate * 100)}%)`).join(", ")}`,
      }),
    };
  };

  for (const route of routes) {
    fastify.get(
      route.path,
      {
        schema: { ...HEALTH_SCHEMA_BASE, operationId: route.operationId },
        config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      },
      handler
    );
  }
}
