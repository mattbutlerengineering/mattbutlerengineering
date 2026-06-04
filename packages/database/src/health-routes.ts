import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import type { HealthResponse } from "@mbe/types";
import type { RateLimitMonitor, ErrorRateSnapshot } from "@mbe/observability";
import type { SlowQueryStats, PoolMetrics, ServiceStatus } from "./index.js";
import type { LatencyTracker, Auth0CheckResult } from "./health.js";

export interface HealthRouteConfig {
  readonly path: string;
  readonly operationId: string;
}

export interface HealthRoutesOptions {
  /** Prisma client instance — must support $queryRaw */
  readonly prisma: { $queryRaw: (query: TemplateStringsArray) => Promise<unknown> };
  /** Returns slow query stats from the database module */
  readonly getSlowQueryStats: () => SlowQueryStats;
  /** Returns overall service status from the database module */
  readonly getServiceStatus: () => ServiceStatus;
  /** Returns pool metrics from the database module */
  readonly getPoolMetrics: () => PoolMetrics;
  /** Latency tracker instance for DB ping anomaly detection */
  readonly latencyTracker: LatencyTracker;
  /** Auth0 JWKS check function — defaults to the shared checkAuth0 */
  readonly checkAuth0: (jwksUrl?: string) => Promise<Auth0CheckResult>;
  /** Rate limit monitor — from createRateLimitMonitor() in create-service-app */
  readonly rateLimitMonitor: RateLimitMonitor;
  /** Error rate snapshot getter — from errorRatePlugin_ decoration */
  readonly getErrorRates: () => ErrorRateSnapshot;
  /** Routes to register — each gets the same health handler */
  readonly routes: readonly HealthRouteConfig[];
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
  const {
    prisma,
    getSlowQueryStats,
    getServiceStatus,
    getPoolMetrics,
    latencyTracker,
    checkAuth0: checkAuth0Fn,
    rateLimitMonitor,
    getErrorRates,
    routes,
  } = opts;

  const healthHandler = async (request: FastifyRequest): Promise<HealthResponse> => {
    const checks: Record<string, { status: string; latency?: number; message?: string }> = {};
    const { apiVersion, successorVersion, sunsetDate } = request.server as unknown as {
      apiVersion: string;
      successorVersion?: string;
      sunsetDate: string;
    };

    // Database ping
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      const dbLatency = Date.now() - dbStart;
      const anomaly = latencyTracker.checkAnomaly(dbLatency);
      latencyTracker.record(dbLatency);
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
    const slowQueries = getSlowQueryStats();
    const dbStatus = checks.database?.status ?? "ok";
    const slowQueryStatus = getServiceStatus();

    checks.slow_queries = {
      status: slowQueryStatus,
      message: `${slowQueries.count5min} slow queries in last 5min (slowest: ${slowQueries.slowestMs}ms)`,
      latency: slowQueries.slowestMs,
    };

    // Auth0 JWKS
    const auth0Result = await checkAuth0Fn();
    checks.auth0 = {
      status: auth0Result.status,
      latency: auth0Result.latency,
      ...(auth0Result.message && { message: auth0Result.message }),
    };

    // Rate limits
    const rateLimitSnapshot = rateLimitMonitor.getSnapshot();
    checks.rate_limits = {
      status: rateLimitSnapshot.isDegraded ? "degraded" : "ok",
      ...rateLimitSnapshot.stats,
      ...(rateLimitSnapshot.isDegraded && {
        message: `High rate limit activity: ${rateLimitSnapshot.stats.hits_last_hour} hits from ${rateLimitSnapshot.stats.blocked_ips} IPs`,
      }),
    };

    // Pool metrics
    const poolMetrics = getPoolMetrics();
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

    // Error rates
    const errorRates = getErrorRates();
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

export const registerHealthRoutes = fp(healthRoutesPlugin, {
  name: "health-routes",
  fastify: "5.x",
});
