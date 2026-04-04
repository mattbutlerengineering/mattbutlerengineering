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
import { guestRoutes } from "./routes/guests.js";
import { floorPlanRoutes } from "./routes/floor-plans.js";
import { availabilityRoutes } from "./routes/availability.js";
import { holdRoutes } from "./routes/holds.js";
import { eventRoutes } from "./routes/events.js";

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
        log(level: unknown, args: unknown) {
          return {
            level,
            service: "reservations-service",
            ...(args[0]?.requestId ? { requestId: args[0].requestId } : {}),
            ...(args[0]?.userId ? { userId: args[0].userId } : {}),
            ...(typeof args[0] === "object" ? args[0] : { message: args[0] }),
          };
        },
      },
    },
  });

  // Register plugins
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN ?? true,
  });

  await fastify.register(swagger, {
    openapi: {
      info: {
        title: "Reservations Service API",
        description:
          "RESTful API for restaurant table reservations. Supports both authenticated users and guest reservations.",
        version: "1.0.0",
        contact: {
          name: "API Support",
          email: "support@example.com",
        },
      },
      servers: [
        ...(process.env.API_BASE_URL
          ? [
              {
                url: process.env.API_BASE_URL,
                description: "Production",
              },
            ]
          : []),
        {
          url: `http://localhost:${process.env.PORT ?? 3004}`,
          description: "Local development",
        },
      ],
      tags: [
        {
          name: "Health",
          description: "Service health and status endpoints",
        },
        {
          name: "Venue Groups",
          description: "Venue group management endpoints",
        },
        {
          name: "Venues",
          description: "Venue management endpoints",
        },
        {
          name: "Guests",
          description: "Guest CRM endpoints",
        },
        {
          name: "Tables",
          description: "Table management endpoints",
        },
        {
          name: "Floor Plans",
          description: "Floor plan and table positioning endpoints",
        },
        {
          name: "Reservations",
          description: "Reservation CRUD operations",
        },
        {
          name: "Availability",
          description: "Availability checking and time slot generation",
        },
        {
          name: "Holds",
          description: "Reservation hold management for the booking flow",
        },
        {
          name: "Events",
          description: "Server-Sent Events for real-time updates",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "JWT token obtained from the authentication provider",
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
    routePrefix: "/scalar",
    configuration: {
      title: "Reservations Service API",
      theme: "deepSpace",
    },
  });

  // Register shared schemas
  registerSchemas(fastify);

  // Register auth plugin (permissive — populates request.user when token present)
  if (process.env.AUTH_AUTHORITY && process.env.AUTH_AUDIENCE) {
    await fastify.register(authPlugin, getAuthPluginOptionsFromEnv());
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
  await fastify.register(venueRoutes, { prefix: "/api/v1/venues" });
  await fastify.register(guestRoutes, { prefix: "/api/v1/guests" });
  await fastify.register(tableRoutes, { prefix: "/api/v1/tables" });
  await fastify.register(floorPlanRoutes, { prefix: "/api/v1/floor-plans" });
  await fastify.register(reservationRoutes, { prefix: "/api/v1/reservations" });
  await fastify.register(availabilityRoutes, { prefix: "/api/v1/availability" });
  await fastify.register(holdRoutes, { prefix: "/api/v1/holds" });
  await fastify.register(eventRoutes, { prefix: "/api/v1/events" });

  return fastify;
}
