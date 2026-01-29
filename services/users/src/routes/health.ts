import type { FastifyPluginAsync } from "fastify";
import type { HealthResponse } from "@mbe/types";
import { prisma } from "../services/database.js";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: HealthResponse }>(
    "/health",
    {
      schema: {
        summary: "Service health check",
        operationId: "getHealth",
        description:
          "Check the health status of the service and its dependencies. Returns status of database connectivity and latency metrics.",
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
                  properties: {
                    status: {
                      type: "string",
                      enum: ["ok", "error"],
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
      },
    },
    async () => {
      const checks: HealthResponse["checks"] = {};

      // Check database connection
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
    }
  );
};
