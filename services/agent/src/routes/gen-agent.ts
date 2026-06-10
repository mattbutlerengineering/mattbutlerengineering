/// <reference types="@fastify/rate-limit" />
import { anthropic } from "@ai-sdk/anthropic";
import { streamText, stepCountIs } from "ai";
import type { FastifyRequest, FastifyPluginAsync } from "fastify";
import { requireAuth } from "@mbe/auth/fastify";
import { createProblemDetails } from "@mbe/types";
// eslint-disable-next-line no-restricted-imports -- agent tools call reservation API on behalf of authenticated user
import { createApiClient } from "@mbe/api-client";
import { catalog } from "@mbe/rialto-catalog/catalog";
import { z } from "zod";
import { createAgentTools, WRITE_TOOLS } from "./gen-agent-tools.js";
import { GEN_MODEL_ID, buildGenMessages, logGenCost, applyStreamHeaders } from "./gen-stream.js";

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

export const genAgentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/gen/agent",
    {
      preHandler: [requireAuth],
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 hour",
          keyGenerator: (request: FastifyRequest) =>
            request.user?.id ?? request.ip,
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
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;
      const api = createApiClient({
        baseUrl: process.env.API_BASE_URL ?? "http://localhost:3000",
        getAccessToken: () => token,
      });
      const agentTools = createAgentTools(request.log, api);

      const result = streamText({
        model: anthropic(GEN_MODEL_ID),
        messages: buildGenMessages(SYSTEM_PROMPT, messages),
        tools: agentTools,
        stopWhen: stepCountIs(5),
        onFinish: async ({ usage, providerMetadata }) =>
          logGenCost(request.log, {
            userId: request.user?.id,
            usage,
            providerMetadata,
            label: "gen-agent cost log",
          }),
      });

      applyStreamHeaders(reply, "application/x-ndjson; charset=utf-8");

      const encoder = new TextEncoder();
      const ndjsonStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const event of result.fullStream) {
              if (event.type === "text-delta") {
                const line = JSON.stringify({
                  type: "text",
                  content: event.text,
                });
                controller.enqueue(encoder.encode(line + "\n"));
              } else if (event.type === "tool-call") {
                if (event.toolName === "render_component") {
                  const input = event.input as { elements?: unknown[] };
                  for (const element of input.elements ?? []) {
                    const line = JSON.stringify({ type: "element", element });
                    controller.enqueue(encoder.encode(line + "\n"));
                  }
                } else if (WRITE_TOOLS.has(event.toolName)) {
                  const line = JSON.stringify({
                    type: "action_request",
                    actionId: event.toolCallId,
                    toolName: event.toolName,
                    toolInput: event.input,
                  });
                  controller.enqueue(encoder.encode(line + "\n"));
                } else {
                  const line = JSON.stringify({
                    type: "tool_status",
                    tool: event.toolName,
                    status: "running",
                  });
                  controller.enqueue(encoder.encode(line + "\n"));
                }
              } else if (event.type === "tool-result") {
                const line = JSON.stringify({
                  type: "tool_status",
                  tool: event.toolName,
                  status: "complete",
                });
                controller.enqueue(encoder.encode(line + "\n"));
              }
            }
          } finally {
            controller.close();
          }
        },
      });

      return reply.send(ndjsonStream);
    }
  );
};
