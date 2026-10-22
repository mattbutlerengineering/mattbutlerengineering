import type { FastifyBaseLogger, FastifyReply } from "fastify";

/**
 * Shared infrastructure for the `/api/gen/*` streaming routes (gen-agent, gen-chat).
 *
 * Both routes call the Anthropic API via the AI SDK and stream the response.
 * The model id, prompt-cache hints, cost logging, and streaming headers were
 * duplicated across both; they live here so a change touches one place.
 */

/**
 * Conversational + agent gen routes both run on haiku. One upgrade, one edit.
 *
 * Haiku 5.5, not 4.5: same tier, but $0.10/$0.50 per MTok against 4.5's
 * $1.00/$5.00 — a tenth of the price for the newer model. Forced `toolChoice`
 * (which gen-ui relies on to get a structured `render_component` call) is still
 * supported here; it is the Opus/Sonnet 5.5 tier that rejects it. Note 5.5 runs
 * adaptive thinking on by default and those tokens bill as output, so they
 * count against GEN_MAX_OUTPUT_TOKENS below.
 */
export const GEN_MODEL_ID = "claude-haiku-5-5";

/** USD per MTok, keyed by model id. */
const GEN_MODEL_PRICING = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
} as const;

/**
 * Rates for GEN_MODEL_ID, used by the aggregate spend ceiling. Keyed by model id
 * so changing GEN_MODEL_ID without adding its rates fails at module load instead
 * of silently mispricing every generation.
 */
export const GEN_PRICING = (() => {
  const rates = (
    GEN_MODEL_PRICING as Record<string, (typeof GEN_MODEL_PRICING)[keyof typeof GEN_MODEL_PRICING]>
  )[GEN_MODEL_ID];
  if (!rates) throw new Error(`No pricing declared for GEN_MODEL_ID "${GEN_MODEL_ID}"`);
  return rates;
})();

/**
 * Per-request output-token ceiling. App-level limits are the only exact spend
 * cap (#6948). Thinking tokens bill as output and count against it.
 */
export const GEN_MAX_OUTPUT_TOKENS = 2048;

type GenChatMessage = { readonly role: "user" | "assistant"; readonly content: string };

/**
 * Builds the `messages` array for `streamText`: a cache-controlled system
 * message followed by the conversation. Caching must go through the messages
 * array (not top-level `system:`) so `providerOptions` is honored.
 */
export function buildGenMessages(systemPrompt: string, messages: ReadonlyArray<GenChatMessage>) {
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
  }
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
    opts.label
  );
}

/** Streaming passthrough headers shared by all gen routes; caller picks the content type. */
export function applyStreamHeaders(reply: FastifyReply, contentType: string): void {
  reply.header("Content-Type", contentType);
  reply.header("Cache-Control", "no-cache");
  reply.header("Connection", "keep-alive");
  reply.header("X-Accel-Buffering", "no");
}
