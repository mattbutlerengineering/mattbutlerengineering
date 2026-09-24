/// <reference types="@fastify/rate-limit" />
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { requireAuth } from "@mbe/auth/fastify";
import { createProblemDetails } from "@mbe/types";
// Import directly from catalog (not index) to avoid pulling in registry.tsx (browser-only)
import { catalog } from "@mbe/rialto-catalog/catalog";
import { VisibilityConditionStrictSchema } from "@json-render/core";
import { tool } from "ai";
import { z } from "zod";
import { GEN_MODEL_ID, logGenCost, applyStreamHeaders } from "./gen-stream.js";
import { createGenRunner } from "./gen-runner.js";

// catalog.prompt() documents the components/props (kept) but also instructs
// the model to emit raw JSONL RFC-6902 patch text (@json-render/core's
// default text protocol) — irrelevant here since toolChoice below forces a
// structured render_component call instead. This addendum overrides that
// with the actual FlatElement contract flatToTree needs: `key` identifies an
// element, `parentKey` links it to its parent (omitted/null for the root).
const RENDER_TOOL_INSTRUCTIONS =
  "Ignore any instructions above about emitting JSONL patch text — for this " +
  "request, call the render_component tool exactly once with the complete " +
  "list of elements. Each element needs a unique `key` (not `id`) and, for " +
  "every element except the root, a `parentKey` set to its parent's `key` " +
  "(omit `parentKey` on the root element). Do not use `children` — the tree " +
  "is assembled purely from `parentKey` links.";

// Memoize catalog prompt at module load — avoid re-generating per request
const SYSTEM_PROMPT = `${catalog.prompt()}\n\n${RENDER_TOOL_INSTRUCTIONS}`;

const GenUiBodySchema = z.object({
  // createRefinementPrompt (apps/gen) embeds the entire existing spec JSON in
  // the prompt when refining — a modest real spec easily exceeds a few KB.
  prompt: z.string().min(1).max(20000),
  context: z.record(z.string(), z.unknown()).optional(),
});

// A single, side-effect-free render tool — unlike gen-agent's tool set, this
// route never touches reservations/guests/tables, so it's safe to expose to
// the public gen playground (apps/gen) with only a prompt as input.
// Built lazily (per-request, like gen-agent-tools.ts's createAgentTools)
// rather than at module scope, so importing this route never calls the AI
// SDK's tool() helper as a side effect of buildApp().
//
// Schema matches @json-render/core's FlatElement (key/parentKey/type/props/
// visible) — NOT id/children. flatToTree's real implementation keys strictly
// on `key`/`parentKey`; an id/children shape silently collapses into a
// `{root: undefined}` empty tree (#5714 review).
//
// `visible` uses the real VisibilityCondition type (boolean | condition
// object | condition array — see @json-render/core), not a plain boolean:
// catalog.prompt() itself teaches the model object-valued conditions (state/
// item/index comparisons, $and/$or composition) as part of the render
// contract, so a boolean-only schema would reject exactly the shape the
// model is instructed to produce (#5720 review).
function createRenderComponentTool() {
  return tool({
    description:
      "Render the generated UI as a tree of rialto catalog components. Call once with the complete list of elements.",
    inputSchema: z.object({
      elements: z.array(
        z.object({
          key: z.string(),
          parentKey: z.string().nullable().optional(),
          type: z.string(),
          props: z.record(z.string(), z.unknown()).optional(),
          visible: VisibilityConditionStrictSchema.optional(),
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
 * Streams NDJSON where each line is a flat element (`{key, parentKey, type,
 * props}`) with no envelope — that's the contract useGenStream's
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
        // Force the tool call — without this, the model may just answer with
        // text (ignoring the tool entirely) and the route would stream zero
        // elements with no indication anything went wrong.
        toolChoice: { type: "tool", toolName: "render_component" },
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
          let emittedAny = false;
          try {
            await runner.run(
              [{ role: "user", content: userContent }],
              { render_component: createRenderComponentTool() },
              async (event) => {
                if (event.type === "element") {
                  emittedAny = true;
                  controller.enqueue(encoder.encode(JSON.stringify(event.element) + "\n"));
                }
              }
            );
            if (!emittedAny) {
              // The run completed with no error (ai@7's error/tool-error parts
              // are already turned into a throw by gen-runner.ts) but never
              // called render_component with a non-empty elements array — a
              // 200 with an empty body is exactly as useless to the client as
              // a failed generation, and both must read as failures, not as
              // "worked, rendered nothing".
              throw new Error("Generation completed with zero elements");
            }
            controller.close();
          } catch (err) {
            // Never silently close on failure — that turns a failed
            // generation into what looks like a successful-but-truncated
            // one. Erroring the stream surfaces it as a real failure instead.
            controller.error(err instanceof Error ? err : new Error(String(err)));
          }
        },
      });

      return reply.send(stream);
    }
  );
};
