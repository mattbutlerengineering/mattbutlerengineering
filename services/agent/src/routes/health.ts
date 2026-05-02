import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import type { HealthResponse } from "@mbe/types";
import type { RateLimitMonitor } from "@mbe/observability";
import { prisma, getSlowQueryStats, getServiceStatus } from "../services/database.js";
import { checkAuth0, checkLatencyAnomaly, recordDbLatency } from "../services/health-checks.js";

export const healthRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const healthSchema = {
    summary: "Service health check",
    description: "Check agent service health and database connectivity.",
    tags: ["Health"],
    response: {
      200: {
        description: "Service health status",
        type: "object",
        properties: {
          status: { type: "string", enum: ["ok", "degraded", "error"] },
          version: { type: "string" },
          timestamp: { type: "string", format: "date-time" },
          checks: {
            type: "object",
            additionalProperties: {
              type: "object",
              additionalProperties: true,
              properties: {
                status: { type: "string", enum: ["ok", "error", "degraded"] },
                message: { type: "string" },
                latency: { type: "number" },
              },
            },
          },
          error_rates: {
            type: "object",
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
    },
  };

  const healthHandler = async (request: FastifyRequest): Promise<HealthResponse> => {
    const checks: Record<string, { status: string; latency?: number; message?: string }> = {};
    const { apiVersion, successorVersion, sunsetDate } = request.server as unknown as {
      apiVersion: string;
      successorVersion?: string;
      sunsetDate: string;
    };

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

    const slowQueries = getSlowQueryStats();
    const dbStatus = checks.database?.status ?? "ok";
    const slowQueryStatus = getServiceStatus();

    checks.slow_queries = {
      status: slowQueryStatus,
      message: `${slowQueries.count5min} slow queries in last 5min (slowest: ${slowQueries.slowestMs}ms)`,
      latency: slowQueries.slowestMs,
    };

    const auth0Result = await checkAuth0();
    checks.auth0 = {
      status: auth0Result.status,
      latency: auth0Result.latency,
      ...(auth0Result.message && { message: auth0Result.message }),
    };

    const rateLimitMonitor = (request.server as unknown as { rateLimitMonitor: RateLimitMonitor }).rateLimitMonitor;
    const rateLimitSnapshot = rateLimitMonitor.getSnapshot();
    checks.rate_limits = {
      status: rateLimitSnapshot.isDegraded ? "degraded" : "ok",
      ...rateLimitSnapshot.stats,
      ...(rateLimitSnapshot.isDegraded && {
        message: `High rate limit activity: ${rateLimitSnapshot.stats.hits_last_hour} hits from ${rateLimitSnapshot.stats.blocked_ips} IPs`,
      }),
    };

    const errorRates = fastify.getErrorRates();
    const degradedEndpoints = errorRates.endpoints.filter((e) => e.rate > 0.1 && e.total >= 5);
    
    const hasErrors =
      dbStatus === "error" ||
      slowQueryStatus === "degraded" ||
      auth0Result.status === "degraded" ||
      rateLimitSnapshot.isDegraded ||
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

  // /health — used by DO App Platform internal health checks (direct container access)
  // lgtm[js/missing-rate-limiting] — rate limiting is applied globally via @fastify/rate-limit in app.ts
  fastify.get<{ Reply: HealthResponse }>(
    "/health",
    { schema: { ...healthSchema, operationId: "getAgentHealth" } },
    healthHandler
  );

  // /api/gen/health — public path via DO ingress (preservePathPrefix: true, prefix "/api/gen")
  // Required for synthetic monitoring hitting api.mattbutlerengineering.com/api/gen/health
  // lgtm[js/missing-rate-limiting] — rate limiting is applied globally via @fastify/rate-limit in app.ts
  fastify.get<{ Reply: HealthResponse }>(
    "/api/gen/health",
    { schema: { ...healthSchema, operationId: "getAgentHealthApiGen" } },
    healthHandler
  );
};
