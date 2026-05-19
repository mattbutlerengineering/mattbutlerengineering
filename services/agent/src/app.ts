import type { FastifyInstance } from "fastify";
import { createServiceApp, type AppOptions } from "@mbe/database";
import { registerSchemas } from "./schemas/index.js";
import { healthRoutes } from "./routes/health.js";
import { readinessRoutes } from "./routes/ready.js";
import { sessionRoutes } from "./routes/sessions.js";
import { sessionEventsRoutes } from "./routes/session-events.js";
import { orchestrateRoutes } from "./routes/orchestrate.js";
import { remediationRoutes } from "./routes/remediation.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { genChatRoutes } from "./routes/gen-chat.js";
import { genSpecsRoutes } from "./routes/gen-specs.js";
import { genAgentRoutes } from "./routes/gen-agent.js";

/**
 * Creates the Fastify application instance.
 */
export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const fastify = await createServiceApp(
    {
      swagger: {
        title: "MBE Agent API",
        description: "API for AI agent sessions and orchestration",
        serverUrl: "http://localhost:3003",
      },
      registerSchemas,
    },
    options
  );

  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(readinessRoutes);
  await fastify.register(sessionRoutes, { prefix: "/v1/sessions" });
  await fastify.register(sessionEventsRoutes, { prefix: "/v1/sessions" });
  await fastify.register(orchestrateRoutes, { prefix: "/v1/orchestrate" });
  await fastify.register(webhookRoutes, { prefix: "/v1/webhooks" });
  await fastify.register(remediationRoutes, { prefix: "/v1/webhooks" });
  await fastify.register(genChatRoutes);
  await fastify.register(genSpecsRoutes);
  await fastify.register(genAgentRoutes);

  return fastify;
}
