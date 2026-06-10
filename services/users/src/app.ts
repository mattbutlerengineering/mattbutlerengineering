import type { FastifyInstance } from "fastify";
import { createServiceApp, type AppOptions } from "@mbe/service-bootstrap";
import { registerSchemas } from "./schemas/index.js";
import { healthRoutes } from "./routes/health.js";
import { readinessRoutes } from "./routes/ready.js";
import { userRoutes } from "./routes/users.js";

/**
 * Creates the Fastify application instance.
 */
export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const fastify = await createServiceApp(
    {
      swagger: {
        title: "MBE Users API",
        description: "API for managing users and preferences",
        serverUrl: "http://localhost:3001",
      },
      registerSchemas,
    },
    options
  );

  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(readinessRoutes);
  // Full path prefix — ingress forwards with preservePathPrefix: true
  await fastify.register(userRoutes, { prefix: "/api/v1/users" });

  return fastify;
}
