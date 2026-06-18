/// <reference types="@fastify/rate-limit" />
import type { FastifyRequest, FastifyPluginAsync } from "fastify";
import { requireAuth } from "@mbe/auth/fastify";
import { createProblemDetails } from "@mbe/types";
// eslint-disable-next-line no-restricted-imports -- agent tools call reservation API on behalf of authenticated user
import { createApiClient } from "@mbe/api-client";
import { catalog } from "@mbe/rialto-catalog/catalog";
import { z } from "zod";
import { createAgentTools } from "./gen-agent-tools.js";
import { GEN_MODEL_ID, logGenCost, applyStreamHeaders } from "./gen-stream.js";
import { createGenRunner } from "./gen-runner.js";

const SYSTEM_PROMPT = catalog.prompt();

const GenAgentBodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
  venueId: z.string().optional(),
});

const encoder = new TextEncoder();

export const genAgentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/gen/agent",
    {
      preHandler: [requireAuth],
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 hour",
          keyGenerator: (request: FastifyRequest) => request.user?.id ?? request.ip,
        },
      },
    },
    async (request, reply) => {
      const parseResult = GenAgentBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply
          .code(400)
          .send(
            createProblemDetails(
              400,
              "Bad Request",
              parseResult.error.issues.map((i) => i.message).join(", ")
            )
          );
      }

      const { messages } = parseResult.data;
      const authHeader = request.headers.authorization;
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      const api = createApiClient({
        baseUrl: process.env.API_BASE_URL ?? "http://localhost:3000",
        getAccessToken: () => token,
      });
      const agentTools = createAgentTools(request.log, api);
      const runner = createGenRunner({
        systemPrompt: SYSTEM_PROMPT,
        modelId: GEN_MODEL_ID,
        maxSteps: 5,
        onFinish: async ({ usage, providerMetadata }) =>
          logGenCost(request.log, {
            userId: request.user?.id,
            usage,
            providerMetadata,
            label: "gen-agent cost log",
          }),
      });

      applyStreamHeaders(reply, "application/x-ndjson; charset=utf-8");

      const ndjsonStream = new ReadableStream({
        async start(controller) {
          try {
            await runner.run(messages, agentTools, async (event) => {
              const line = JSON.stringify(event);
              controller.enqueue(encoder.encode(line + "\n"));
            });
          } finally {
            controller.close();
          }
        },
      });

      return reply.send(ndjsonStream);
    }
  );
};
