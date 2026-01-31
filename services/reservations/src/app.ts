import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import ScalarApiReference from "@scalar/fastify-api-reference";
import { registerSchemas } from "./schemas/index.js";
import { healthRoutes } from "./routes/health.js";
import { tableRoutes } from "./routes/tables.js";
import { reservationRoutes } from "./routes/reservations.js";

export interface AppOptions {
  logger?: boolean | object;
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: options.logger ?? {
      level: process.env.LOG_LEVEL ?? "info",
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
          url: `http://localhost:${process.env.PORT ?? 3002}`,
          description: "Local development",
        },
      ],
      tags: [
        {
          name: "Health",
          description: "Service health and status endpoints",
        },
        {
          name: "Tables",
          description: "Table management endpoints",
        },
        {
          name: "Reservations",
          description: "Reservation CRUD operations",
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

  await fastify.register(ScalarApiReference, {
    routePrefix: "/docs",
    configuration: {
      title: "Reservations Service API",
      theme: "deepSpace",
    },
  });

  // Register shared schemas
  registerSchemas(fastify);

  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(tableRoutes, { prefix: "/v1/tables" });
  await fastify.register(reservationRoutes, { prefix: "/v1/reservations" });

  return fastify;
}
