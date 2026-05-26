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
          keyGenerator: (request: FastifyRequest) => request.user?.id ?? request.ip,
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

      // GEN-06: model for chat — always haiku (conversational doesn't need sonnet)
      const MODEL_ID = "claude-haiku-4.5";

      const result = streamText({
        model: anthropic(MODEL_ID),
        // GEN-05: prompt caching via providerOptions on the system message
        // CRITICAL: must use messages array (not top-level system:) to support providerOptions
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
            providerOptions: {
              anthropic: { cacheControl: { type: "ephemeral" } },
            },
          },
          ...messages,
        ],
        // GEN-06: cost logging in onFinish
        onFinish: async ({ usage, providerMetadata }) => {
          const anthropicMeta = providerMetadata?.anthropic as
            | {
                cacheCreationInputTokens?: number;
                cacheReadInputTokens?: number;
              }
            | undefined;
          request.log.info(
            {
              userId: request.user?.id,
              modelId: MODEL_ID,
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              cacheReadInputTokens: anthropicMeta?.cacheReadInputTokens ?? 0,
              cacheCreationInputTokens: anthropicMeta?.cacheCreationInputTokens ?? 0,
            },
            "gen-chat cost log"
          );
        },
      });

      // GEN-07: SSE passthrough headers — text/plain prevents browser HTML rendering
      reply.header("Content-Type", "text/plain; charset=utf-8");
      reply.header("Cache-Control", "no-cache");
      reply.header("Connection", "keep-alive");
      reply.header("X-Accel-Buffering", "no");

      // Sanitize AI output to prevent XSS (OWASP LLM02)
      return reply.send(createSanitizedStream(result.textStream));
    }
  );
};
