import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import ScalarApiReference from "@scalar/fastify-api-reference";
import { authPlugin, getAuthPluginOptionsFromEnv } from "@mbe/auth/fastify";
import { sentryFastifyPlugin } from "@mbe/sentry/node";
import { apiVersioningPlugin } from "@mbe/api-versioning/fastify";
import { registerSchemas } from "./schemas/index.js";
import { healthRoutes } from "./routes/health.js";
import { sessionRoutes } from "./routes/sessions.js";
import { sessionEventsRoutes } from "./routes/session-events.js";
import { orchestrateRoutes } from "./routes/orchestrate.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { remediationRoutes } from "./routes/remediation.js";
import { genUiRoutes } from "./routes/gen-ui.js";
import { genChatRoutes } from "./routes/gen-chat.js";
import { genSpecsRoutes } from "./routes/gen-specs.js";

export interface AppOptions {
  logger?: boolean | object;
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const logLevel = process.env.LOG_LEVEL ?? (nodeEnv === "production" ? "info" : "debug");

  const fastify = Fastify({
    logger: options.logger ?? {
      level: logLevel,
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
            path: request.routeOptions?.url,
            parameters: request.params,
            headers: { host: request.headers.host },
          };
        },
        res(reply) {
          return {
            statusCode: reply.statusCode,
          };
        },
      },
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
      formatters: {
        log(level: string, args: Record<string, unknown>) {
          return {
            level,
            service: "agent-service",
            ...(args[0]?.requestId ? { requestId: args[0].requestId } : {}),
            ...(args[0]?.userId ? { userId: args[0].userId } : {}),
            ...(typeof args[0] === "object" ? args[0] : { message: args[0] }),
          };
        },
      },
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

  await fastify.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: false,
    },
  });

  await fastify.register(ScalarApiReference, {
    routePrefix: "/scalar",
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

  // Auth plugin — must be registered before rate limit so request.user is available
  // Only register if auth env vars are present (skipped in test environments)
  if (process.env.AUTH_AUTHORITY && process.env.AUTH_AUDIENCE) {
    await fastify.register(authPlugin, getAuthPluginOptionsFromEnv());
  }

  // GEN-04: per-user rate limiting — global default, gen routes override per-route
  await fastify.register(rateLimit, {
    hook: "preHandler", // runs after requireAuth so request.user is set
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (req) => (req.user?.id ?? req.ip) as string,
  });

  // Register Sentry error handler (no-op without SENTRY_DSN)
  await fastify.register(sentryFastifyPlugin);

  // Register API versioning headers
  await fastify.register(apiVersioningPlugin, {
    currentVersion: "v1",
    successorVersion: "v2",
    sunsetMonthsFromNow: 6,
  });

  registerSchemas(fastify);
  await fastify.register(healthRoutes);
  await fastify.register(sessionRoutes, { prefix: "/v1/sessions" });
  await fastify.register(sessionEventsRoutes, { prefix: "/v1/sessions" });
  await fastify.register(orchestrateRoutes, { prefix: "/v1/orchestrate" });
  await fastify.register(webhookRoutes, { prefix: "/v1/webhooks" });
  await fastify.register(remediationRoutes, { prefix: "/v1/webhooks" });
  await fastify.register(genUiRoutes);
  await fastify.register(genChatRoutes);
  await fastify.register(genSpecsRoutes);

  return fastify;
}
