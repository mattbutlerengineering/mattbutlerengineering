import type { FastifyBaseLogger, FastifyReply } from "fastify";

/**
 * Shared infrastructure for the `/api/gen/*` streaming routes (gen-agent, gen-chat).
 *
 * Both routes call the Anthropic API via the AI SDK and stream the response.
 * The model id, prompt-cache hints, cost logging, and streaming headers were
 * duplicated across both; they live here so a change touches one place.
 */

/** Conversational + agent gen routes both run on haiku. One upgrade, one edit. */
export const GEN_MODEL_ID = "claude-haiku-4.5";

type GenChatMessage = { readonly role: "user" | "assistant"; readonly content: string };

/**
 * Builds the `messages` array for `streamText`: a cache-controlled system
 * message followed by the conversation. Caching must go through the messages
 * array (not top-level `system:`) so `providerOptions` is honored.
 */
export function buildGenMessages(
  systemPrompt: string,
  messages: ReadonlyArray<GenChatMessage>,
) {
  return [
    {
      role: "system" as const,
      content: systemPrompt,
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" as const } } },
    },
    ...messages,
  ];
}

interface GenUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

/**
 * Logs token usage + Anthropic cache hit/miss for a gen request. Call from the
 * route's `onFinish` so the AI SDK still infers the callback's own types.
 */
export function logGenCost(
  log: FastifyBaseLogger,
  opts: {
    readonly userId?: string;
    readonly usage: GenUsage;
    readonly providerMetadata?: unknown;
    readonly label: string;
  },
): void {
  const anthropicMeta = (
    opts.providerMetadata as
      | { anthropic?: { cacheCreationInputTokens?: number; cacheReadInputTokens?: number } }
      | undefined
  )?.anthropic;

  log.info(
    {
      userId: opts.userId,
      modelId: GEN_MODEL_ID,
      inputTokens: opts.usage.inputTokens,
      outputTokens: opts.usage.outputTokens,
      cacheReadInputTokens: anthropicMeta?.cacheReadInputTokens ?? 0,
      cacheCreationInputTokens: anthropicMeta?.cacheCreationInputTokens ?? 0,
    },
    opts.label,
  );
}

/** Streaming passthrough headers shared by all gen routes; caller picks the content type. */
export function applyStreamHeaders(reply: FastifyReply, contentType: string): void {
  reply.header("Content-Type", contentType);
  reply.header("Cache-Control", "no-cache");
  reply.header("Connection", "keep-alive");
  reply.header("X-Accel-Buffering", "no");
}
