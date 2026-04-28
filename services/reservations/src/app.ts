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
import { tableRoutes } from "./routes/tables.js";
import { reservationRoutes } from "./routes/reservations.js";
import { venueRoutes } from "./routes/venues.js";
import { availabilityRoutes } from "./routes/availability.js";
import { holdRoutes } from "./routes/holds.js";
import { eventRoutes } from "./routes/events.js";
import { floorPlanRoutes } from "./routes/floor-plans.js";
import { guestRoutes } from "./routes/guests.js";

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
    ajv: {
      customOptions: {
        strict: false,
      },
    },
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
        title: "MBE Reservations API",
        description: "API for managing table reservations and availability",
        version: "1.0.0",
      },
      servers: [{ url: "http://localhost:3004" }],
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
    fastify.log.warn("Skipping Auth0 plugin registration (dev/test mode)");
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
  await fastify.register(tableRoutes, { prefix: "/api/v1/tables" });
  await fastify.register(reservationRoutes, { prefix: "/api/v1/reservations" });
  await fastify.register(venueRoutes, { prefix: "/api/v1/venues" });
  await fastify.register(availabilityRoutes, { prefix: "/api/v1/availability" });
  await fastify.register(holdRoutes, { prefix: "/api/v1/holds" });
  await fastify.register(eventRoutes, { prefix: "/api/v1/events" });
  await fastify.register(floorPlanRoutes, { prefix: "/api/v1/floor-plans" });
  await fastify.register(guestRoutes, { prefix: "/api/v1/guests" });

  return fastify;
}
