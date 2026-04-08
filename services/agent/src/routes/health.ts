import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { HealthResponse } from "@mbe/types";
import { prisma, getSlowQueryStats, getServiceStatus } from "../services/database.js";
import { checkAuth0, checkLatencyAnomaly, recordDbLatency } from "../services/health-checks.js";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
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
              properties: {
                status: { type: "string", enum: ["ok", "error"] },
                message: { type: "string" },
                latency: { type: "number" },
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

  const hasErrors = dbStatus === "error" || slowQueryStatus === "degraded" || auth0Result.status === "degraded";

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

  // /health — used by DO App Platform internal health checks (direct container access)
  fastify.get<{ Reply: HealthResponse }>(
    "/health",
    { schema: { ...healthSchema, operationId: "getAgentHealth" } },
    healthHandler
  );

  // /api/gen/health — public path via DO ingress (preservePathPrefix: true, prefix "/api/gen")
  // Required for synthetic monitoring hitting api.mattbutlerengineering.com/api/gen/health
  fastify.get<{ Reply: HealthResponse }>(
    "/api/gen/health",
    { schema: { ...healthSchema, operationId: "getAgentHealthApiGen" } },
    healthHandler
  );
};
