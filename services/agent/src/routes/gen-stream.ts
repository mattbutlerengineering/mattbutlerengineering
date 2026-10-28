import type { FastifyBaseLogger, FastifyReply } from "fastify";

/**
 * Shared infrastructure for the `/api/gen/*` streaming routes (gen-ui, gen-agent).
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
/**
 * A 50-field form is a few thousand tokens of JSON. 2048 (shared with
 * thinking) truncated it or sat until the gateway timed out. Thinking is
 * disabled on the gen runner, so this budget is for the tool call itself.
 */
export const GEN_MAX_OUTPUT_TOKENS = 4096;

/**
 * The cache-controlled system prompt for `streamText`'s `instructions` option.
 * ai@7 rejects system-role entries inside `messages` (AI_InvalidPromptError:
 * "Use the instructions option instead") — caught by the first live prod
 * generation, invisible to every test that mocks `ai`. `instructions` accepts
 * a full SystemModelMessage, so the ephemeral cacheControl on the catalog
 * prompt is preserved. Contract pinned by gen-runner.prompt-contract.test.ts
 * against the real package.
 */
export function genSystemInstructions(systemPrompt: string) {
  return {
    role: "system" as const,
    content: systemPrompt,
    providerOptions: { anthropic: { cacheControl: { type: "ephemeral" as const } } },
  };
}

interface GenUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly inputTokenDetails?: {
    readonly cacheReadTokens?: number;
    readonly cacheWriteTokens?: number;
  };
}

/**
 * Anthropic prompt-cache reads/writes for one generation. ai@7 reports them on
 * `usage.inputTokenDetails`; `providerMetadata.anthropic` carries only the raw
 * response `usage` (snake_case), never top-level cache counters (#7435). The
 * legacy top-level fields stay as the last fallback.
 */
export function cacheTokens(
  usage: GenUsage,
  providerMetadata: unknown
): { readonly read: number; readonly write: number } {
  const meta = (
    providerMetadata as
      | {
          anthropic?: {
            usage?: { cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
            cacheReadInputTokens?: number;
            cacheCreationInputTokens?: number;
          };
        }
      | undefined
  )?.anthropic;
  return {
    read:
      usage.inputTokenDetails?.cacheReadTokens ??
      meta?.usage?.cache_read_input_tokens ??
      meta?.cacheReadInputTokens ??
      0,
    write:
      usage.inputTokenDetails?.cacheWriteTokens ??
      meta?.usage?.cache_creation_input_tokens ??
      meta?.cacheCreationInputTokens ??
      0,
  };
}

/** Per-run timings and output size, logged on the cost line. Zeroed when unmeasurable. */
export interface GenTelemetry {
  /** ms from request start to the first emitted event (0 if none was emitted). */
  readonly ttftMs: number;
  /** ms from request start to the run finishing or failing. */
  readonly durationMs: number;
  readonly elementCount: number;
  /** The AI SDK's finish reason, or "error" for a failed run. */
  readonly finishReason: string;
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
    readonly telemetry?: GenTelemetry;
  }
): void {
  const cache = cacheTokens(opts.usage, opts.providerMetadata);

  log.info(
    {
      userId: opts.userId,
      modelId: GEN_MODEL_ID,
      inputTokens: opts.usage.inputTokens ?? 0,
      outputTokens: opts.usage.outputTokens ?? 0,
      cacheReadInputTokens: cache.read,
      cacheCreationInputTokens: cache.write,
      ttftMs: opts.telemetry?.ttftMs ?? 0,
      durationMs: opts.telemetry?.durationMs ?? 0,
      elementCount: opts.telemetry?.elementCount ?? 0,
      finishReason: opts.telemetry?.finishReason ?? "unknown",
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
