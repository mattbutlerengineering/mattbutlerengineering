import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

// ── Types ───────────────────────────────────────────────────────────

export interface QaTuningThresholds {
  readonly acceptanceRateFloor: number;
  readonly maxBudgetUSD: number;
  readonly maxRetries: number;
  readonly stuckTurnsThreshold: number;
  readonly meanCloseHoursTarget: number;
  readonly agentMergeShareTarget: number;
}

export interface QaTuningConfig {
  readonly version: number;
  readonly lastTunedAt: string;
  readonly thresholds: QaTuningThresholds;
}

// ── Zod Schema ─────────────────────────────────────────────────────

const QaTuningThresholdsSchema = z.object({
  acceptanceRateFloor: z.number(),
  maxBudgetUSD: z.number(),
  maxRetries: z.number(),
  stuckTurnsThreshold: z.number(),
  meanCloseHoursTarget: z.number(),
  agentMergeShareTarget: z.number(),
});

/**
 * Full config schema — validates the top-level shape plus thresholds.
 * Uses `.passthrough()` so extra keys (like `$comment` fields, `rules`,
 * `history`) don't cause validation failures.
 */
export const QaTuningConfigSchema = z
  .object({
    version: z.number(),
    lastTunedAt: z.string(),
    thresholds: QaTuningThresholdsSchema.passthrough(),
  })
  .passthrough();

// ── Constants ───────────────────────────────────────────────────────

const CONFIG_FILENAME = ".github/auto-qa-tuning.json";

// ── Pure functions (exported for testing) ───────────────────────────

/**
 * Extract only the threshold values we care about from a parsed config.
 * Validates `raw` against the Zod schema and returns null on failure.
 */
export function parseThresholds(
  raw: unknown,
): QaTuningThresholds | null {
  const result = QaTuningConfigSchema.safeParse(raw);

  if (!result.success) {
    return null;
  }

  const { thresholds } = result.data;

  return {
    acceptanceRateFloor: thresholds.acceptanceRateFloor,
    maxBudgetUSD: thresholds.maxBudgetUSD,
    maxRetries: thresholds.maxRetries,
    stuckTurnsThreshold: thresholds.stuckTurnsThreshold,
    meanCloseHoursTarget: thresholds.meanCloseHoursTarget,
    agentMergeShareTarget: thresholds.agentMergeShareTarget,
  };
}

/**
 * Apply QA tuning thresholds as session config defaults.
 *
 * Rules:
 *   - `maxBudgetUSD` from tuning is used only when the session config
 *     still has the hard-coded default (1.0). An explicit CLI `--max-budget`
 *     always wins.
 *   - `stuckTurnsThreshold` maps to `zeroProgressThreshold` in the
 *     stuck detector config. It is applied only when no explicit
 *     `stuckDetectorConfig.zeroProgressThreshold` was provided.
 *
 * Returns a new object — never mutates the input.
 */
export function applyTuningDefaults(
  sessionDefaults: {
    readonly maxBudgetUsd: number;
    readonly stuckDetectorConfig?: { readonly zeroProgressThreshold?: number };
  },
  tuning: QaTuningThresholds,
  hardCodedDefaultBudget: number,
): {
  readonly maxBudgetUsd: number;
  readonly stuckDetectorConfig: { readonly zeroProgressThreshold: number } | undefined;
} {
  // Only override budget if the session is still at the hard-coded default
  const budgetOverridden = sessionDefaults.maxBudgetUsd !== hardCodedDefaultBudget;
  const effectiveBudget = budgetOverridden
    ? sessionDefaults.maxBudgetUsd
    : tuning.maxBudgetUSD;

  // Only override stuck threshold if not explicitly set
  const explicitThreshold =
    sessionDefaults.stuckDetectorConfig?.zeroProgressThreshold;
  const effectiveStuckConfig =
    explicitThreshold !== undefined
      ? { zeroProgressThreshold: explicitThreshold }
      : { zeroProgressThreshold: tuning.stuckTurnsThreshold };

  return {
    maxBudgetUsd: effectiveBudget,
    stuckDetectorConfig: effectiveStuckConfig,
  };
}

// ── IO (side-effectful — not exported for unit-test purity) ─────────

/**
 * Load QA tuning thresholds from the repo's `.github/auto-qa-tuning.json`.
 *
 * Returns null when:
 *   - The file doesn't exist (first run, or running outside the repo)
 *   - The JSON is syntactically invalid
 *   - Schema validation fails (missing/wrong-type fields)
 *
 * On validation failure a structured warning is logged so operators can
 * diagnose bad config without the agent crashing.
 *
 * Callers should treat null as "use hard-coded defaults" — this function
 * never throws.
 */
export function loadQaTuning(repoPath: string): QaTuningThresholds | null {
  const configPath = resolve(repoPath, CONFIG_FILENAME);

  if (!existsSync(configPath)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (err) {
    console.warn("[qa-tuning] Failed to parse config JSON", {
      path: configPath,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  const result = QaTuningConfigSchema.safeParse(raw);

  if (!result.success) {
    console.warn("[qa-tuning] Config validation failed", {
      path: configPath,
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return null;
  }

  const { thresholds } = result.data;

  return {
    acceptanceRateFloor: thresholds.acceptanceRateFloor,
    maxBudgetUSD: thresholds.maxBudgetUSD,
    maxRetries: thresholds.maxRetries,
    stuckTurnsThreshold: thresholds.stuckTurnsThreshold,
    meanCloseHoursTarget: thresholds.meanCloseHoursTarget,
    agentMergeShareTarget: thresholds.agentMergeShareTarget,
  };
}
