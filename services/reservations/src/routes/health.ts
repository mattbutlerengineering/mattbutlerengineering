import type { FastifyPluginAsync, RouteHandlerMethod, RawServerDefault } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { HealthResponse } from "@mbe/types";
import type { RateLimitMonitor } from "@mbe/observability";
import { prisma, getSlowQueryStats, getServiceStatus } from "../services/database.js";
import { checkAuth0, checkLatencyAnomaly, recordDbLatency } from "../services/health-checks.js";

type HealthRouteHandler = RouteHandlerMethod<
  RawServerDefault,
  IncomingMessage,
  ServerResponse,
  { Reply: HealthResponse }
>;

const healthSchema = {
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

const healthHandler: HealthRouteHandler = async (request) => {
  const checks: Record<string, { status: string; latency?: number; message?: string }> = {};
  const { apiVersion, successorVersion, sunsetDate } = request.server as unknown as {
    apiVersion: string;
    successorVersion?: string;
    sunsetDate: string;
  };

  // Check database connection
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

  const hasErrors = dbStatus === "error" || slowQueryStatus === "degraded" || auth0Result.status === "degraded" || rateLimitSnapshot.isDegraded;

  return {
    status: hasErrors ? "degraded" : "ok",
    version: "1.0.0",
    apiVersion,
    successorVersion,
    sunsetDate,
    timestamp: new Date().toISOString(),
    checks,
  };
};

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // /health — used by DO App Platform internal health checks (direct container access)
  fastify.get("/health", { schema: { ...healthSchema, operationId: "getHealth" } }, healthHandler);

  // /api/health — public path via DO ingress (preservePathPrefix: true, prefix "/api")
  // Required for post-deploy verification workflow hitting api.mattbutlerengineering.com/api/health
  fastify.get("/api/health", { schema: { ...healthSchema, operationId: "getHealthApi" } }, healthHandler);

  // /api/v1/reservations/health — public path via DO ingress (preservePathPrefix: true, prefix "/api/v1/reservations")
  // Must be registered here (not in reservationRoutes) to avoid falling through to /:id param route
  fastify.get("/api/v1/reservations/health", { schema: { ...healthSchema, operationId: "getHealthApiReservations" } }, healthHandler);
};
