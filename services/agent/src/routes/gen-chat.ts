/// <reference types="@fastify/rate-limit" />
import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "@mbe/auth/fastify";
import { createProblemDetails } from "@mbe/types";
// Import directly from catalog (not index) to avoid pulling in registry.tsx (browser-only)
import { catalog } from "@mbe/rialto-catalog/catalog";
import { createSanitizedStream } from "@mbe/agent-core";
import { z } from "zod";
import { GEN_MODEL_ID, buildGenMessages, logGenCost, applyStreamHeaders } from "./gen-stream.js";

// Memoize catalog prompt at module load — avoid re-generating per request
const SYSTEM_PROMPT = catalog.prompt();

const GenChatBodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
});

export const genChatRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/gen/chat",
    {
      preHandler: [requireAuth],
      config: {
        // GEN-04: per-route rate limit override — per-user by Auth0 sub claim
        rateLimit: {
          max: 50,
          timeWindow: "1 hour",
          keyGenerator: (request: FastifyRequest) =>
            request.user?.id ?? request.ip,
        },
      },
    },
    async (request, reply) => {
      // Validate request body
      const parseResult = GenChatBodySchema.safeParse(request.body);
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

      const result = streamText({
        // GEN-06: model for chat — always haiku (conversational doesn't need sonnet)
        model: anthropic(GEN_MODEL_ID),
        // GEN-05: prompt caching via providerOptions on the system message
        messages: buildGenMessages(SYSTEM_PROMPT, messages),
        // GEN-06: cost logging in onFinish
        onFinish: async ({ usage, providerMetadata }) =>
          logGenCost(request.log, {
            userId: request.user?.id,
            usage,
            providerMetadata,
            label: "gen-chat cost log",
          }),
      });

      // GEN-07: SSE passthrough headers — text/plain prevents browser HTML rendering
      applyStreamHeaders(reply, "text/plain; charset=utf-8");

      // Sanitize AI output to prevent XSS (OWASP LLM02)
      return reply.send(createSanitizedStream(result.textStream));
    }
  );
};
