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
import { userRoutes } from "./routes/users.js";

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
            service: "users-service",
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
      title: "Users Service API",
      theme: "deepSpace",
    },
  });

  // Register shared schemas
  registerSchemas(fastify);

  // Register auth plugin (permissive — populates request.user when token present)
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
  // Full path prefix — ingress forwards with preservePathPrefix: true
  await fastify.register(userRoutes, { prefix: "/api/v1/users" });

  return fastify;
}
