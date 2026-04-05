import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import ScalarApiReference from "@scalar/fastify-api-reference";
import { authPlugin, getAuthPluginOptionsFromEnv } from "@mbe/auth/fastify";
import { sentryFastifyPlugin } from "@mbe/sentry/node";
import { apiVersioningPlugin } from "@mbe/api-versioning/fastify";
import { registerSchemas } from "./schemas/index.js";
import { healthRoutes } from "./routes/health.js";
import { tableRoutes } from "./routes/tables.js";
import { reservationRoutes } from "./routes/reservations.js";
import { venueRoutes } from "./routes/venues.js";
import { availabilityRoutes } from "./routes/availability.js";
import { holdRoutes } from "./routes/holds.js";
import { eventRoutes } from "./routes/events.js";

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
  await fastify.register(cors, {
    origin: true,
    credentials: true,
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
  if (process.env.AUTH0_DOMAIN) {
    await fastify.register(authPlugin, getAuthPluginOptionsFromEnv());
  } else if (process.env.NODE_ENV === "production") {
    throw new Error("Fail-closed: AUTH_AUTHORITY and AUTH_AUDIENCE are required in production");
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
  await fastify.register(tableRoutes, { prefix: "/api/v1/tables" });
  await fastify.register(reservationRoutes, { prefix: "/api/v1/reservations" });
  await fastify.register(venueRoutes, { prefix: "/api/v1/venues" });
  await fastify.register(availabilityRoutes, { prefix: "/api/v1/availability" });
  await fastify.register(holdRoutes, { prefix: "/api/v1/holds" });
  await fastify.register(eventRoutes, { prefix: "/api/v1/events" });

  return fastify;
}
