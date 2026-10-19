/**
 * Cost estimation utilities for agent sessions without live API calls.
 *
 * Provides:
 * - Token counting estimation based on text length
 * - Cost calculation using model pricing tables
 * - Session cost profiling across multiple runs
 * - Latency simulation with configurable delays
 */

// ── Pricing tables ────────────────────────────────────────────────────

export interface ModelPricing {
  readonly model: string;
  /** Cost per 1M input tokens in USD */
  readonly inputCostPer1MTokens: number;
  /** Cost per 1M output tokens in USD */
  readonly outputCostPer1MTokens: number;
  /** Cost per 1M cache-write tokens in USD */
  readonly cacheWritePer1MTokens?: number;
  /** Cost per 1M cache-read tokens in USD */
  readonly cacheReadPer1MTokens?: number;
}

/** Pricing as of July 2026 (standard, non-introductory rates) — update as Anthropic changes rates. */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-4-6": {
    model: "claude-sonnet-4-6",
    inputCostPer1MTokens: 3.0,
    outputCostPer1MTokens: 15.0,
    cacheWritePer1MTokens: 3.75,
    cacheReadPer1MTokens: 0.3,
  },
  "claude-sonnet-5": {
    model: "claude-sonnet-5",
    inputCostPer1MTokens: 3.0,
    outputCostPer1MTokens: 15.0,
    cacheWritePer1MTokens: 3.75,
    cacheReadPer1MTokens: 0.3,
  },
  "claude-haiku-4-5": {
    model: "claude-haiku-4-5",
    inputCostPer1MTokens: 0.8,
    outputCostPer1MTokens: 4.0,
    cacheWritePer1MTokens: 1.0,
    cacheReadPer1MTokens: 0.08,
  },
  "claude-opus-4-8": {
    model: "claude-opus-4-8",
    inputCostPer1MTokens: 5.0,
    outputCostPer1MTokens: 25.0,
    cacheWritePer1MTokens: 6.25,
    cacheReadPer1MTokens: 0.5,
  },
} as const;

const DEFAULT_MODEL = "claude-sonnet-5";

// ── Cost calculation ──────────────────────────────────────────────────

export interface TokenUsageInput {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheWriteTokens?: number;
  readonly cacheReadTokens?: number;
}

export interface CostBreakdown {
  readonly model: string;
  readonly inputCostUsd: number;
  readonly outputCostUsd: number;
  readonly cacheWriteCostUsd: number;
  readonly cacheReadCostUsd: number;
  readonly totalCostUsd: number;
}

/**
 * Calculates the cost for a given token usage without any API calls.
 */
export function calculateCost(usage: TokenUsageInput, model = DEFAULT_MODEL): CostBreakdown {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING[DEFAULT_MODEL];
  if (!pricing) throw new Error(`No pricing found for model "${model}" or default model`);

  const inputCostUsd = (usage.inputTokens / 1_000_000) * pricing.inputCostPer1MTokens;
  const outputCostUsd = (usage.outputTokens / 1_000_000) * pricing.outputCostPer1MTokens;
  const cacheWriteCostUsd =
    usage.cacheWriteTokens !== undefined && pricing.cacheWritePer1MTokens !== undefined
      ? (usage.cacheWriteTokens / 1_000_000) * pricing.cacheWritePer1MTokens
      : 0;
  const cacheReadCostUsd =
    usage.cacheReadTokens !== undefined && pricing.cacheReadPer1MTokens !== undefined
      ? (usage.cacheReadTokens / 1_000_000) * pricing.cacheReadPer1MTokens
      : 0;

  const totalCostUsd = inputCostUsd + outputCostUsd + cacheWriteCostUsd + cacheReadCostUsd;

  return {
    model: pricing.model,
    inputCostUsd,
    outputCostUsd,
    cacheWriteCostUsd,
    cacheReadCostUsd,
    totalCostUsd,
  };
}
