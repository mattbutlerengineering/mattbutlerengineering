import type { FastifyPluginAsync } from "fastify";
import type { HealthResponse } from "@mbe/types";
import { prisma } from "../services/database.js";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: HealthResponse }>(
    "/health",
    {
      schema: {
        description: "Health check endpoint",
        tags: ["Health"],
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["ok", "degraded", "error"] },
              version: { type: "string" },
              timestamp: { type: "string" },
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
