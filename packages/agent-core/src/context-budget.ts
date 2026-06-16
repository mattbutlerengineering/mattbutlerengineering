/**
 * Proactive context management for agent sessions.
 *
 * Tracks estimated token usage per turn and exposes strategy hints
 * at configurable thresholds so the session loop can take preemptive
 * action before hitting context limits.
 */

// ── Types ──────────────────────────────────────────────────────────

export type ContextStrategy = "targeted_reads" | "wrap_up" | "checkpoint" | "graceful_exit";

export interface ContextUsage {
  readonly used: number;
  readonly limit: number;
  readonly remaining: number;
  readonly percentUsed: number;
}

export interface ContextStrategyHint {
  readonly strategy: ContextStrategy;
  readonly percentUsed: number;
  readonly message: string;
}

export interface ContextMetrics {
  readonly contextPercentAtExit: number;
  readonly peakContextPercent: number;
  readonly contextLimit: number;
  readonly compactionCount: number;
}

export interface TurnTokenData {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface ContextBudgetConfig {
  /** Max tool output in characters before truncation. Default: 20_000 (~5k tokens). */
  readonly maxToolOutputChars: number;
}

export interface ContextBudget {
  /** Record token usage from a turn. inputTokens = cumulative context size. */
  track(turn: TurnTokenData): void;
  /** Record a compaction event. */
  trackCompaction(): void;
  /** Current context usage snapshot. */
  usage(): ContextUsage;
  /** Number of compactions observed. */
  compactionCount(): number;
  /** Whether context is high enough to warrant compaction (85%+). */
  shouldCompact(): boolean;
  /** Strategy hint for the current usage level, or null if below 50%. */
  strategyHint(): ContextStrategyHint | null;
  /** Human-readable strategy message, or null if below 50%. */
  strategyMessage(): string | null;
  /** Peak context percentage seen during the session. */
  peakPercent(): number;
  /** Truncate tool output if it exceeds the configured max. */
  truncateToolOutput(output: string): string;
  /** Metrics for Langfuse/observability. */
  metrics(): ContextMetrics;
}

// ── Model context limits ───────────────────────────────────────────

const FALLBACK_CONTEXT_LIMIT = 200_000;

export const MODEL_CONTEXT_LIMITS: Readonly<Record<string, number>> = {
  "claude-haiku-4-5-20251001": 200_000,
  "claude-sonnet-4-6": 200_000,
  "claude-opus-4-8": 1_000_000,
};

function resolveContextLimit(modelId: string): number {
  // Exact match first
  if (MODEL_CONTEXT_LIMITS[modelId] !== undefined) {
    return MODEL_CONTEXT_LIMITS[modelId];
  }
  // Pattern match for model families
  if (modelId.includes("opus")) return 1_000_000;
  if (modelId.includes("sonnet")) return 200_000;
  if (modelId.includes("haiku")) return 200_000;
  return FALLBACK_CONTEXT_LIMIT;
}

// ── Threshold definitions ──────────────────────────────────────────

interface Threshold {
  readonly percent: number;
  readonly strategy: ContextStrategy;
  readonly message: string;
}

// Ordered highest-first so we return the most urgent applicable strategy
const THRESHOLDS: readonly Threshold[] = [
  {
    percent: 95,
    strategy: "graceful_exit",
    message: "Context at {pct}% — commit what is done, log remaining work as TODO",
  },
  {
    percent: 85,
    strategy: "checkpoint",
    message: "Context at {pct}% — summarize progress, commit partial work if possible",
  },
  {
    percent: 70,
    strategy: "wrap_up",
    message: "Context at {pct}% — wrap up current task, avoid exploratory reads",
  },
  {
    percent: 50,
    strategy: "targeted_reads",
    message: "Context at {pct}% — prefer targeted reads over full-file reads",
  },
];

// ── Factory ────────────────────────────────────────────────────────

const DEFAULT_CONFIG: ContextBudgetConfig = {
  maxToolOutputChars: 20_000,
};

export function createContextBudget(
  modelId: string,
  configOverrides?: Partial<ContextBudgetConfig>
): ContextBudget {
  const budgetConfig = { ...DEFAULT_CONFIG, ...configOverrides };
  const limit = resolveContextLimit(modelId);

  let currentUsed = 0;
  let peak = 0;
  let compactions = 0;

  function percentUsed(): number {
    return Math.round((currentUsed / limit) * 100);
  }

  return {
    track(turn: TurnTokenData): void {
      // inputTokens reflects cumulative conversation context
      currentUsed = turn.inputTokens;
      const pct = percentUsed();
      if (pct > peak) {
        peak = pct;
      }
    },

    trackCompaction(): void {
      compactions++;
    },

    usage(): ContextUsage {
      const pct = percentUsed();
      return {
        used: currentUsed,
        limit,
        remaining: Math.max(0, limit - currentUsed),
        percentUsed: pct,
      };
    },

    compactionCount(): number {
      return compactions;
    },

    shouldCompact(): boolean {
      return percentUsed() >= 85;
    },

    strategyHint(): ContextStrategyHint | null {
      const pct = percentUsed();
      for (const threshold of THRESHOLDS) {
        if (pct >= threshold.percent) {
          return {
            strategy: threshold.strategy,
            percentUsed: pct,
            message: threshold.message.replace("{pct}", String(pct)),
          };
        }
      }
      return null;
    },

    strategyMessage(): string | null {
      const hint = this.strategyHint();
      return hint?.message ?? null;
    },

    peakPercent(): number {
      return peak;
    },

    truncateToolOutput(output: string): string {
      if (output.length <= budgetConfig.maxToolOutputChars) {
        return output;
      }
      const truncated = output.slice(0, budgetConfig.maxToolOutputChars);
      return `${truncated}\n\n...truncated (${output.length} chars total). Use offset/limit to read specific sections.`;
    },

    metrics(): ContextMetrics {
      return {
        contextPercentAtExit: percentUsed(),
        peakContextPercent: peak,
        contextLimit: limit,
        compactionCount: compactions,
      };
    },
  };
}
