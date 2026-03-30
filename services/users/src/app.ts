import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import ScalarApiReference from "@scalar/fastify-api-reference";
import { authPlugin, getAuthPluginOptionsFromEnv } from "@mbe/auth/fastify";
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
        ...(process.env.API_BASE_URL
          ? [
              {
                url: process.env.API_BASE_URL,
                description: "Production",
              },
            ]
          : []),
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

  // Register auth plugin (permissive — populates request.user when token present)
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const hasAuthVars = process.env.AUTH_AUTHORITY && process.env.AUTH_AUDIENCE;

  if (hasAuthVars) {
    await fastify.register(authPlugin, getAuthPluginOptionsFromEnv());
  } else if (nodeEnv === "production") {
    throw new Error(
      "Fail-closed: AUTH_AUTHORITY and AUTH_AUDIENCE are required in production. " +
        "Refusing to start without authentication."
    );
  } else {
    fastify.log.warn(
      "Auth plugin skipped — AUTH_AUTHORITY and AUTH_AUDIENCE not set. " +
        "This is only acceptable in development/test environments."
    );
  }

  // Register routes
  await fastify.register(healthRoutes);
  // Full path prefix — ingress forwards with preservePathPrefix: true
  await fastify.register(userRoutes, { prefix: "/api/v1/users" });

  return fastify;
}
