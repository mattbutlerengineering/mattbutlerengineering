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

/** Pricing as of early 2026 — update as Anthropic changes rates. */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-4-6": {
    model: "claude-sonnet-4-6",
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
  "claude-opus-4-5": {
    model: "claude-opus-4-5",
    inputCostPer1MTokens: 15.0,
    outputCostPer1MTokens: 75.0,
    cacheWritePer1MTokens: 18.75,
    cacheReadPer1MTokens: 1.5,
  },
} as const;

const DEFAULT_MODEL = "claude-sonnet-4-6";

// ── Token estimation ──────────────────────────────────────────────────

/**
 * Rough token count estimate based on character count.
 * Uses the ~4 chars/token heuristic for English prose/code.
 * Not suitable for precise billing — use for test budget calculations.
 */
export function estimateTokenCount(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Estimates input tokens for a typical agent prompt including system prompt overhead.
 */
export function estimatePromptTokens(
  taskDescription: string,
  systemPromptOverhead = 2000
): number {
  return estimateTokenCount(taskDescription) + systemPromptOverhead;
}

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
export function calculateCost(
  usage: TokenUsageInput,
  model = DEFAULT_MODEL
): CostBreakdown {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING[DEFAULT_MODEL];

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

/**
 * Estimates the cost of a session given a task description and expected output size.
 * Useful for budget planning before running real sessions.
 */
export function estimateSessionCost(
  taskDescription: string,
  options: {
    readonly model?: string;
    readonly expectedOutputTokens?: number;
    readonly numTurns?: number;
    readonly systemPromptOverhead?: number;
  } = {}
): CostBreakdown {
  const {
    model = DEFAULT_MODEL,
    expectedOutputTokens = 500,
    numTurns = 5,
    systemPromptOverhead = 2000,
  } = options;

  const inputTokens = estimatePromptTokens(taskDescription, systemPromptOverhead) * numTurns;
  const outputTokens = expectedOutputTokens * numTurns;

  return calculateCost({ inputTokens, outputTokens }, model);
}

// ── Session cost profiler ─────────────────────────────────────────────

export interface SessionCostProfile {
  readonly sessionId: string;
  readonly model: string;
  readonly usage: TokenUsageInput;
  readonly breakdown: CostBreakdown;
  readonly durationMs: number;
  readonly timestamp: string;
}

export interface CostProfilerSummary {
  readonly totalSessions: number;
  readonly totalCostUsd: number;
  readonly averageCostUsd: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly mostExpensiveSession: SessionCostProfile | null;
  readonly cheapestSession: SessionCostProfile | null;
}

export interface CostProfiler {
  readonly record: (
    sessionId: string,
    usage: TokenUsageInput,
    durationMs: number,
    model?: string
  ) => SessionCostProfile;
  readonly summary: () => CostProfilerSummary;
  readonly profiles: () => readonly SessionCostProfile[];
  readonly reset: () => void;
}

/**
 * Creates a session cost profiler for tracking usage across multiple test runs.
 */
export function createCostProfiler(): CostProfiler {
  const profileLog: SessionCostProfile[] = [];

  function record(
    sessionId: string,
    usage: TokenUsageInput,
    durationMs: number,
    model = DEFAULT_MODEL
  ): SessionCostProfile {
    const breakdown = calculateCost(usage, model);
    const profile: SessionCostProfile = {
      sessionId,
      model,
      usage,
      breakdown,
      durationMs,
      timestamp: new Date().toISOString(),
    };
    profileLog.push(profile);
    return profile;
  }

  function summary(): CostProfilerSummary {
    if (profileLog.length === 0) {
      return {
        totalSessions: 0,
        totalCostUsd: 0,
        averageCostUsd: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        mostExpensiveSession: null,
        cheapestSession: null,
      };
    }

    const totalCostUsd = profileLog.reduce((sum, p) => sum + p.breakdown.totalCostUsd, 0);
    const totalInputTokens = profileLog.reduce((sum, p) => sum + p.usage.inputTokens, 0);
    const totalOutputTokens = profileLog.reduce((sum, p) => sum + p.usage.outputTokens, 0);

    const sorted = [...profileLog].sort(
      (a, b) => b.breakdown.totalCostUsd - a.breakdown.totalCostUsd
    );

    return {
      totalSessions: profileLog.length,
      totalCostUsd,
      averageCostUsd: totalCostUsd / profileLog.length,
      totalInputTokens,
      totalOutputTokens,
      mostExpensiveSession: sorted[0] ?? null,
      cheapestSession: sorted[sorted.length - 1] ?? null,
    };
  }

  return {
    record,
    summary,
    profiles(): readonly SessionCostProfile[] {
      return [...profileLog];
    },
    reset(): void {
      profileLog.length = 0;
    },
  };
}

// ── Budget guard ──────────────────────────────────────────────────────

/**
 * Returns true if the estimated cost of a session would exceed the budget.
 * Use this in tests to assert that sessions stay within budget bounds.
 */
export function wouldExceedBudget(
  taskDescription: string,
  maxBudgetUsd: number,
  options: {
    readonly model?: string;
    readonly expectedOutputTokens?: number;
    readonly numTurns?: number;
  } = {}
): boolean {
  const estimate = estimateSessionCost(taskDescription, options);
  return estimate.totalCostUsd > maxBudgetUsd;
}

// ── Latency simulation ────────────────────────────────────────────────

export interface LatencyProfile {
  /** Base latency in ms per API call. */
  readonly baseMs: number;
  /** Additional ms per 1000 input tokens. */
  readonly msPerKInputTokens: number;
  /** Additional ms per 100 output tokens. */
  readonly msPerHundredOutputTokens: number;
  /** Random jitter range in ms (±jitterMs). */
  readonly jitterMs: number;
}

export const DEFAULT_LATENCY_PROFILE: LatencyProfile = {
  baseMs: 500,
  msPerKInputTokens: 100,
  msPerHundredOutputTokens: 50,
  jitterMs: 200,
};

/**
 * Estimates the expected latency for a given token usage.
 */
export function estimateLatency(
  usage: TokenUsageInput,
  profile: LatencyProfile = DEFAULT_LATENCY_PROFILE
): number {
  const inputLatency = (usage.inputTokens / 1000) * profile.msPerKInputTokens;
  const outputLatency = (usage.outputTokens / 100) * profile.msPerHundredOutputTokens;
  return profile.baseMs + inputLatency + outputLatency;
}

/**
 * Simulates latency with optional jitter. Returns a promise that resolves after
 * the simulated delay — use in test helpers to pace async sequences.
 */
export async function simulateLatency(
  usage: TokenUsageInput,
  profile: LatencyProfile = DEFAULT_LATENCY_PROFILE
): Promise<number> {
  const base = estimateLatency(usage, profile);
  const jitter = (Math.random() * 2 - 1) * profile.jitterMs;
  const total = Math.max(0, Math.round(base + jitter));
  await new Promise<void>((resolve) => setTimeout(resolve, total));
  return total;
}
