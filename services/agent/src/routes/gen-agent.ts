/// <reference types="@fastify/rate-limit" />
// AI SDK routes "provider/model" strings through Vercel AI Gateway when
// AI_GATEWAY_API_KEY is set in the environment. No @ai-sdk/anthropic import needed.
import { streamText, tool } from "ai";
import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "@mbe/auth/fastify";
import { createProblemDetails } from "@mbe/types";
// Import directly from catalog (not index) to avoid pulling in registry.tsx (browser-only)
import { catalog } from "@mbe/rialto-catalog/catalog";
import { z } from "zod";

// Memoize catalog prompt at module load — avoid re-generating per request
const CATALOG_PROMPT = catalog.prompt();
const STAFF_SUFFIX =
  "\n\nYou are a hospitality staff assistant. Help staff check availability, answer questions about reservations and guests.";
const SYSTEM_PROMPT = CATALOG_PROMPT + STAFF_SUFFIX;

const GenAgentBodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
});

export const genAgentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/gen/agent",
    {
      preHandler: [requireAuth],
      config: {
        // 30 req/hour per user (more conservative than gen-chat's 50)
        rateLimit: {
          max: 30,
          timeWindow: "1 hour",
          keyGenerator: (request: FastifyRequest) => request.user?.id ?? request.ip,
        },
      },
    },
    async (request, reply) => {
      // Validate request body
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

      // Capture token for tool execution — extract from Authorization header
      const authHeader = request.headers.authorization ?? "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

      const modelId = "anthropic/claude-haiku-4-5-20251001";

      const result = streamText({
        model: modelId,
        // GEN-05: prompt caching via providerOptions on the system message
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
        tools: {
          check_availability: tool({
            description: "Check available time slots for a venue on a specific date",
            inputSchema: z.object({
              venueId: z.string().describe("The venue ID to check availability for"),
              date: z.string().describe("ISO date YYYY-MM-DD"),
              partySize: z.number().int().positive().describe("Number of guests"),
            }),
            execute: async ({ venueId, date, partySize }) => {
              const apiBase = process.env.API_URL ?? "http://localhost:3001";
              const params = new URLSearchParams({
                date,
                partySize: String(partySize),
              });
              const url = `${apiBase}/api/v1/availability/${venueId}?${params.toString()}`;
              const headers: Record<string, string> = {
                "Content-Type": "application/json",
              };
              if (token) {
                headers["Authorization"] = `Bearer ${token}`;
              }
              const response = await fetch(url, { headers });
              if (!response.ok) {
                throw new Error(`Availability API error: ${response.status}`);
              }
              const body = (await response.json()) as { data: unknown };
              return body.data;
            },
          }),
        },
        onFinish: async ({ usage, providerMetadata }) => {
          const anthropicMeta = providerMetadata?.anthropic as
            | { cacheCreationInputTokens?: number; cacheReadInputTokens?: number }
            | undefined;
          request.log.info(
            {
              userId: request.user?.id,
              modelId,
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              cacheReadInputTokens: anthropicMeta?.cacheReadInputTokens ?? 0,
              cacheCreationInputTokens: anthropicMeta?.cacheCreationInputTokens ?? 0,
            },
            "gen-agent cost log"
          );
        },
      });

      // NDJSON streaming — each chunk as { type: "text", content: "..." }
      reply.header("Content-Type", "application/x-ndjson; charset=utf-8");
      reply.header("Cache-Control", "no-cache");
      reply.header("Connection", "keep-alive");
      reply.header("X-Accel-Buffering", "no");

      const encoder = new TextEncoder();

      const ndjsonStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of result.textStream) {
              const line = JSON.stringify({ type: "text", content: chunk }) + "\n";
              controller.enqueue(encoder.encode(line));
            }
          } catch {
            // Stream ended or aborted
          } finally {
            controller.close();
          }
        },
      });

      return reply.send(ndjsonStream);
    }
  );
};
