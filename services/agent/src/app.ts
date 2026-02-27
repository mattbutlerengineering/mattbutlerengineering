import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import ScalarApiReference from "@scalar/fastify-api-reference";
import { registerSchemas } from "./schemas/index.js";
import { healthRoutes } from "./routes/health.js";
import { sessionRoutes } from "./routes/sessions.js";
import { sessionEventsRoutes } from "./routes/session-events.js";
import { orchestrateRoutes } from "./routes/orchestrate.js";
import { webhookRoutes } from "./routes/webhooks.js";

export interface AppOptions {
  logger?: boolean | object;
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: options.logger ?? {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN ?? true,
  });

  await fastify.register(swagger, {
    openapi: {
      info: {
        title: "Agent Service API",
        description: "REST API for managing autonomous coding agent sessions",
        version: "1.0.0",
      },
      servers: [
        ...(process.env.API_BASE_URL
          ? [{ url: process.env.API_BASE_URL, description: "Production" }]
          : []),
        {
          url: `http://localhost:${process.env.PORT ?? 3003}`,
          description: "Local development",
        },
      ],
      tags: [
        { name: "Health", description: "Service health endpoints" },
        { name: "Sessions", description: "Agent session management" },
        { name: "Events", description: "Session event streaming" },
        { name: "Orchestration", description: "Task decomposition and multi-session orchestration" },
        { name: "Webhooks", description: "External event triggers (GitHub, CI)" },
      ],
    },
  });

  await fastify.register(ScalarApiReference, {
    routePrefix: "/docs",
    configuration: { title: "Agent Service API", theme: "deepSpace" },
  });

  fastify.addHook("onRequest", async (request) => {
    request.log.info({
      requestId: request.id,
      method: request.method,
      url: request.url,
      remoteAddress: request.ip,
      userAgent: request.headers["user-agent"],
    }, "incoming request");
  });

  fastify.addHook("onSend", async (request, reply) => {
    request.log.info({
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
    }, "request completed");
  });

  registerSchemas(fastify);
  await fastify.register(healthRoutes);
  await fastify.register(sessionRoutes, { prefix: "/v1/sessions" });
  await fastify.register(sessionEventsRoutes, { prefix: "/v1/sessions" });
  await fastify.register(orchestrateRoutes, { prefix: "/v1/orchestrate" });
  await fastify.register(webhookRoutes, { prefix: "/v1/webhooks" });

  return fastify;
}
