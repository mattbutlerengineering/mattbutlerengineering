import type { FastifyPluginAsync } from "fastify";
import type { HealthResponse } from "@mbe/types";
import { prisma } from "../services/database.js";

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

  const healthHandler = async (): Promise<HealthResponse> => {
    const checks: HealthResponse["checks"] = {};

    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = {
        status: "ok",
        latency: Date.now() - dbStart,
      };
    } catch (error) {
      checks.database = {
        status: "error",
        message: error instanceof Error ? error.message : "Database connection failed",
        latency: Date.now() - dbStart,
      };
    }

    const hasErrors = Object.values(checks).some((c) => c.status === "error");

    return {
      status: hasErrors ? "degraded" : "ok",
      version: "1.0.0",
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
