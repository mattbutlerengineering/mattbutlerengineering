import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import ScalarApiReference from "@scalar/fastify-api-reference";
import { registerSchemas } from "./schemas/index.js";
import { healthRoutes } from "./routes/health.js";
import { userRoutes } from "./routes/users.js";

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
        title: "Users Service API",
        description:
          "RESTful API for user management including authentication, profile management, and user preferences.",
        version: "1.0.0",
        contact: {
          name: "API Support",
          email: "support@example.com",
        },
      },
      servers: [
        {
          url: `http://localhost:${process.env.PORT ?? 3001}`,
          description: "Local development",
        },
      ],
      tags: [
        {
          name: "Health",
          description: "Service health and status endpoints",
        },
        {
          name: "Users",
          description: "User CRUD operations and authentication",
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
      title: "Users Service API",
      theme: "deepSpace",
    },
  });

  // Register shared schemas
  registerSchemas(fastify);

  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(userRoutes, { prefix: "/api/v1/users" });

  return fastify;
}
