import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import ScalarApiReference from "@scalar/fastify-api-reference";
import { authPlugin, getAuthPluginOptionsFromEnv } from "@mbe/auth/fastify";
import { createRequestIdMiddleware, errorRatePlugin_, createRateLimitMonitor } from "@mbe/observability";
import { sentryFastifyPlugin } from "@mbe/sentry/node";
import { apiVersioningPlugin } from "@mbe/api-versioning/fastify";
import { registerSchemas } from "./schemas/index.js";
import { healthRoutes } from "./routes/health.js";
import { readinessRoutes } from "./routes/ready.js";
import { sessionRoutes } from "./routes/sessions.js";
import { sessionEventsRoutes } from "./routes/session-events.js";
import { orchestrateRoutes } from "./routes/orchestrate.js";
import { remediationRoutes } from "./routes/remediation.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { genUiRoutes } from "./routes/gen-ui.js";
import { genChatRoutes } from "./routes/gen-chat.js";
import { genSpecsRoutes } from "./routes/gen-specs.js";

export interface AppOptions {
  logger?: boolean | object;
}

/**
 * Creates the Fastify application instance.
 */
export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: options.logger ?? true,
    disableRequestLogging: true,
  });

  // Register schemas
  registerSchemas(fastify);

  // Core plugins
  const defaultDevOrigins = [
    "http://localhost:3000",
    "http://localhost:3002",
    "http://localhost:3003",
    "http://localhost:3004",
    "http://localhost:5173",
    "http://localhost:5174",
  ];
  const prodOrigins = [
    "https://mattbutlerengineering.com",
    "https://hospitality.mattbutlerengineering.com",
    "https://gen.mattbutlerengineering.com",
  ];

  const corsOrigins = process.env.CORS_ORIGINS?.split(",") || [
    ...prodOrigins,
    ...(process.env.NODE_ENV === "development" ? defaultDevOrigins : []),
  ];

  await fastify.register(cors, {
    origin: corsOrigins,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  });

  // Propagate X-Request-ID from edge router for distributed tracing
  await fastify.register(createRequestIdMiddleware());

  // Track per-endpoint error rates (exposed via health check)
  await fastify.register(errorRatePlugin_);

  const rateLimitMonitor = createRateLimitMonitor();
  fastify.decorate("rateLimitMonitor", rateLimitMonitor);

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    onExceeded: (req) => {
      const ip = req.ip;
      const endpoint = req.url;
      rateLimitMonitor.recordHit(ip, endpoint);
      req.log.warn({ ip, endpoint, timestamp: new Date().toISOString() }, "Rate limit exceeded");
    },
  });

  await fastify.register(swagger, {
    openapi: {
      info: {
        title: "MBE Agent API",
        description: "API for AI agent sessions and orchestration",
        version: "1.0.0",
      },
      servers: [{ url: "http://localhost:3003" }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
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
    routePrefix: "/reference",
    configuration: {
      content: () => fastify.swagger(),
    },
  });

  // Register Auth0 plugin
  if (process.env.AUTH_AUTHORITY && process.env.AUTH_AUDIENCE) {
    await fastify.register(authPlugin, getAuthPluginOptionsFromEnv());
  } else if (process.env.NODE_ENV === "production") {
    throw new Error("Fail-closed: AUTH_AUTHORITY and AUTH_AUDIENCE are required in production");
  } else {
    fastify.log.warn("Skipping Auth0 plugin registration: AUTH_AUTHORITY or AUTH_AUDIENCE not set");
  }

  // Register Sentry error handler (no-op without SENTRY_DSN)
  await fastify.register(sentryFastifyPlugin);

  // Register API versioning headers
  await fastify.register(apiVersioningPlugin, {
    currentVersion: "v1",
    successorVersion: "v2",
    sunsetMonthsFromNow: 6,
  });

  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(readinessRoutes);
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
