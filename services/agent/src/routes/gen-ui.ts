/// <reference types="@fastify/rate-limit" />
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { requireAuth } from "@mbe/auth/fastify";
import { createProblemDetails } from "@mbe/types";
// Import directly from catalog (not index) to avoid pulling in registry.tsx (browser-only)
import { catalog } from "@mbe/rialto-catalog/catalog";
import { tool } from "ai";
import { z } from "zod";
import { GEN_MODEL_ID, logGenCost, applyStreamHeaders } from "./gen-stream.js";
import { createGenRunner } from "./gen-runner.js";

// Memoize catalog prompt at module load — avoid re-generating per request
const SYSTEM_PROMPT = catalog.prompt();

const GenUiBodySchema = z.object({
  prompt: z.string().min(1).max(2000),
  context: z.record(z.string(), z.unknown()).optional(),
});

// A single, side-effect-free render tool — unlike gen-agent's tool set, this
// route never touches reservations/guests/tables, so it's safe to expose to
// the public gen playground (apps/gen) with only a prompt as input.
// Built lazily (per-request, like gen-agent-tools.ts's createAgentTools)
// rather than at module scope, so importing this route never calls the AI
// SDK's tool() helper as a side effect of buildApp().
function createRenderComponentTool() {
  return tool({
    description:
      "Render the generated UI as a tree of rialto catalog components. Call once with the complete list of elements.",
    inputSchema: z.object({
      elements: z.array(
        z.object({
          id: z.string(),
          type: z.string(),
          props: z.record(z.string(), z.unknown()).optional(),
          children: z.array(z.string()).optional(),
        })
      ),
    }),
    execute: async () => ({ rendered: true }),
  });
}

const encoder = new TextEncoder();

/**
 * POST /api/gen/ui — the gen playground's generation endpoint
 * (apps/gen/src/pages/usePlaygroundSession.ts -> useGenStream).
 *
 * Streams NDJSON where each line is a flat element (`{id, type, props,
 * children}`) with no envelope — that's the contract useGenStream's
 * streamNDJSON + flatToTree expect. This differs from gen-agent's NDJSON
 * (which wraps every event as `{type, ...}` for the chat-envelope contract
 * useChatStream/ChatPanel consume) — the two are not interchangeable.
 */
export const genUiRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/gen/ui",
    {
      preHandler: [requireAuth],
      config: {
        // Per-user cap — matches gen-agent/gen-chat's per-route rate limit pattern.
        rateLimit: {
          max: 20,
          timeWindow: "1 hour",
          keyGenerator: (request: FastifyRequest) => request.user?.id ?? request.ip,
        },
      },
    },
    async (request, reply) => {
      const parseResult = GenUiBodySchema.safeParse(request.body);
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

      const { prompt, context } = parseResult.data;
      const userContent = context ? `${prompt}\n\nContext: ${JSON.stringify(context)}` : prompt;

      const runner = createGenRunner({
        systemPrompt: SYSTEM_PROMPT,
        modelId: GEN_MODEL_ID,
        maxSteps: 1,
        onFinish: async ({ usage, providerMetadata }) =>
          logGenCost(request.log, {
            userId: request.user?.id,
            usage,
            providerMetadata,
            label: "gen-ui cost log",
          }),
      });

      applyStreamHeaders(reply, "application/x-ndjson; charset=utf-8");

      const stream = new ReadableStream({
        async start(controller) {
          try {
            await runner.run(
              [{ role: "user", content: userContent }],
              { render_component: createRenderComponentTool() },
              async (event) => {
                if (event.type === "element") {
                  controller.enqueue(encoder.encode(JSON.stringify(event.element) + "\n"));
                }
              }
            );
          } finally {
            controller.close();
          }
        },
      });

      return reply.send(stream);
    }
  );
};
