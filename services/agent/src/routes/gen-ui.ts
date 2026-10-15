/// <reference types="@fastify/rate-limit" />
// Import directly from catalog (not index) to avoid pulling in registry.tsx (browser-only)
import { catalog } from "@mbe/rialto-catalog/catalog";
import { VisibilityConditionStrictSchema } from "@json-render/core";
import { tool } from "ai";
import { z } from "zod";
import { createGenRoute } from "./gen-route-factory.js";

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

/**
 * POST /api/gen/ui — the gen playground's generation endpoint
 * (apps/gen/src/pages/usePlaygroundSession.ts -> useGenStream).
 *
 * Streams NDJSON where each line is a flat element (`{key, parentKey, type,
 * props}`) with no envelope — that's the contract useGenStream's
 * streamNDJSON + flatToTree expect. This differs from gen-agent's NDJSON
 * (which wraps every event as `{type, ...}` for the chat-envelope contract
 * useChatStream/ChatPanel consume) — the two are not interchangeable.
 *
 * Framing, error handling (502 on runner failure) and the zero-output guard
 * (a run that emits no elements is a failure, not an empty 200) are owned by
 * the shared gen-route-factory.
 */
export const genUiRoutes = createGenRoute({
  path: "/api/gen/ui",
  costLogLabel: "gen-ui cost log",
  // Per-user cap — matches gen-agent/gen-chat's per-route rate limit pattern.
  rateLimit: { max: 20, timeWindow: "1 hour" },
  schema: GenUiBodySchema,
  streamFormat: "ndjson",
  maxSteps: 1,
  systemPrompt: SYSTEM_PROMPT,
  // Force the tool call — without this, the model may just answer with text
  // (ignoring the tool entirely) and the route would stream zero elements.
  toolChoice: { type: "tool", toolName: "render_component" },
  // Safe here specifically because maxSteps is 1: there is no later step for
  // ai@7 to retry the tool call on, so a tool-error can only ever mean the
  // generation failed outright. gen-agent (maxSteps 5) must NOT set this.
  failOnToolError: true,
  toMessages: ({ prompt, context }) => [
    {
      role: "user",
      content: context
        ? `${prompt}

Context: ${JSON.stringify(context)}`
        : prompt,
    },
  ],
  serializeEvent: (event) => (event.type === "element" ? event.element : undefined),
  getTools: () => ({ render_component: createRenderComponentTool() }),
});
