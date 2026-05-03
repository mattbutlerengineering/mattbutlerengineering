import type { FastifyPluginAsync } from "fastify";
import type { ReadinessResponse } from "@mbe/types";
import { createReadinessTracker } from "@mbe/observability";
import { prisma } from "../services/database.js";

const AUTH0_JWKS_URL = "https://dev-ytbgmz5ls3wh4xdx.us.auth0.com/.well-known/jwks.json";
const JWKS_TIMEOUT_MS = 2000;

const readiness = createReadinessTracker();

readiness.registerCheck("database", async () => {
  await prisma.$queryRaw`SELECT 1`;
});

readiness.registerCheck("auth", async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), JWKS_TIMEOUT_MS);
  try {
    const response = await fetch(AUTH0_JWKS_URL, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`JWKS returned ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
});

const readinessSchema = {
  summary: "Service readiness probe",
  description: "Returns 200 when fully initialized, 503 during startup.",
  tags: ["Health"],
  response: {
    200: {
      description: "Service is ready for traffic",
      type: "object",
      properties: {
        ready: { type: "boolean", const: true },
        timestamp: { type: "string", format: "date-time" },
        checks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              status: { type: "string", enum: ["ok", "error"] },
              message: { type: "string" },
            },
          },
        },
      },
    },
    503: {
      description: "Service is not ready (still starting or dependency unavailable)",
      type: "object",
      properties: {
        ready: { type: "boolean", const: false },
        timestamp: { type: "string", format: "date-time" },
        checks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              status: { type: "string", enum: ["ok", "error"] },
              message: { type: "string" },
            },
          },
        },
      },
    },
  },
};

export const readinessRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: ReadinessResponse }>(
    "/ready",
    { schema: { ...readinessSchema, operationId: "getReady" } },
    async (_request, reply) => {
      const snapshot = await readiness.evaluate();
      const response: ReadinessResponse = {
        ready: snapshot.ready,
        timestamp: snapshot.timestamp,
        checks: snapshot.checks.map((c) => ({
          name: c.name,
          status: c.status,
          ...(c.message ? { message: c.message } : {}),
        })),
      };
      return reply.status(snapshot.ready ? 200 : 503).send(response);
    }
  );
};
