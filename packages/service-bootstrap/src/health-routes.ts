import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import type { HealthResponse } from "@mbe/types";
import { createErrorRateHealthCheck } from "@mbe/observability";
import type { SlowQueryStats, PoolMetrics, ServiceStatus } from "@mbe/database";
import { checkAuth0 as defaultCheckAuth0 } from "./health.js";
import type { Auth0CheckResult } from "./health.js";

/** Minimal database interface health routes need — satisfied by DatabaseInstance<T>. */
export interface HealthDb {
  readonly prisma: {
    $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  };
  readonly getSlowQueryStats: () => SlowQueryStats;
  readonly getServiceStatus: () => ServiceStatus;
  readonly getPoolMetrics: () => PoolMetrics;
}

export interface HealthRouteConfig {
  readonly path: string;
  readonly operationId: string;
}

export interface HealthRoutesOptions {
  /** Database instance — prisma + stats are derived from it internally */
  readonly db: HealthDb;
  /** Routes to register — each gets the same health handler */
  readonly routes: readonly HealthRouteConfig[];
  /**
   * Auth0 JWKS check — defaults to the shared checkAuth0 from @mbe/service-bootstrap.
   * Overrideable for testing without real network calls.
   */
  readonly checkAuth0?: () => Promise<Auth0CheckResult>;
}

const healthSchema = {
  summary: "Service health check",
  tags: ["Health"],
  response: {
    200: {
      description: "Service health status",
      type: "object",
      additionalProperties: true,
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

const healthRoutesPlugin: FastifyPluginAsync<HealthRoutesOptions> = async (
  fastify: FastifyInstance,
  opts: HealthRoutesOptions
) => {
  const { db, routes, checkAuth0 = defaultCheckAuth0 } = opts;

  const healthHandler = async (request: FastifyRequest): Promise<HealthResponse> => {
    const checks: Record<string, { status: string; latency?: number; message?: string }> = {};
    const { apiVersion, successorVersion, sunsetDate } = request.server as unknown as {
      apiVersion: string;
      successorVersion?: string;
      sunsetDate: string;
    };

    // Database ping — latency tracker comes from the fastify decorator set by createServiceApp
    const dbStart = Date.now();
    try {
      await db.prisma.$queryRaw`SELECT 1`;
      const dbLatency = Date.now() - dbStart;
      const anomaly = fastify.latencyTracker.checkAnomaly(dbLatency);
      fastify.latencyTracker.record(dbLatency);
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

    // Auth0 JWKS — default uses shared checkAuth0; overrideable for tests
    const auth0Result = await checkAuth0();
    checks.auth0 = {
      status: auth0Result.status,
      latency: auth0Result.latency,
      ...(auth0Result.message && { message: auth0Result.message }),
    };

    // Rate limits — from fastify.rateLimitMonitor (set by createServiceApp)
    const rateLimitSnapshot = fastify.rateLimitMonitor.getSnapshot();
    checks.rate_limits = {
      status: rateLimitSnapshot.isDegraded ? "degraded" : "ok",
      ...rateLimitSnapshot.stats,
      ...(rateLimitSnapshot.isDegraded && {
        message: `High rate limit activity: ${rateLimitSnapshot.stats.hits_last_hour} hits from ${rateLimitSnapshot.stats.blocked_ips} IPs`,
      }),
    };

    // Pool metrics
    const poolMetrics = db.getPoolMetrics();
    checks.pool = {
      status: poolMetrics.isDegraded ? "degraded" : "ok",
      ...(poolMetrics.isDegraded && {
        message: `Pool utilization high: ${Math.round(poolMetrics.utilization * 100)}% (${poolMetrics.busy}/${poolMetrics.size} busy)`,
      }),
      ...{
        active: poolMetrics.active,
        idle: poolMetrics.idle,
        busy: poolMetrics.busy,
        size: poolMetrics.size,
        utilization: poolMetrics.utilization,
      },
    };

    // Error rates — from fastify.getErrorRates() (set by errorRatePlugin_ in createServiceApp)
    const errorRateCheck = createErrorRateHealthCheck(fastify.getErrorRates());

    const hasErrors =
      dbStatus === "error" ||
      slowQueryStatus === "degraded" ||
      auth0Result.status === "degraded" ||
      rateLimitSnapshot.isDegraded ||
      poolMetrics.isDegraded ||
      errorRateCheck.status === "degraded";

    return {
      status: hasErrors ? "degraded" : "ok",
      version: "1.0.0",
      apiVersion,
      successorVersion,
      sunsetDate,
      timestamp: new Date().toISOString(),
      checks,
      error_rates: {
        endpoints: errorRateCheck.endpoints,
        degraded: errorRateCheck.status === "degraded",
      },
      ...(errorRateCheck.message && { message: errorRateCheck.message }),
    };
  };

  // Register each route with the shared handler
  for (const route of routes) {
    // github[js/missing-rate-limiting] — restrictive limit for DB-intensive health check
    fastify.get<{ Reply: HealthResponse }>(
      route.path,
      {
        schema: { ...healthSchema, operationId: route.operationId } as Record<string, unknown>,
        config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      },
      healthHandler
    );
  }
};

// Note: dependencies: ["error-rate-tracker"] was considered but omitted — the fp
// `dependencies` check requires the named plugin to already be registered, which
// breaks package-level tests that set decorators manually without errorRatePlugin_.
// The decorators guard below is the safe win: it catches missing decorators at
// registration time without requiring a full plugin chain.
export const registerHealthRoutes = fp(healthRoutesPlugin, {
  name: "health-routes",
  fastify: "5.x",
  decorators: { fastify: ["latencyTracker", "rateLimitMonitor", "getErrorRates"] },
});
