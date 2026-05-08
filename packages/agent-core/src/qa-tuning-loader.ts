import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

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

// ── Constants ───────────────────────────────────────────────────────

const CONFIG_FILENAME = ".github/auto-qa-tuning.json";

// ── Pure functions (exported for testing) ───────────────────────────

/**
 * Extract only the threshold values we care about from a parsed config.
 * Returns null if the config shape is invalid.
 */
export function parseThresholds(
  raw: unknown,
): QaTuningThresholds | null {
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("thresholds" in raw)
  ) {
    return null;
  }

  const config = raw as { thresholds: Record<string, unknown> };
  const t = config.thresholds;

  if (typeof t !== "object" || t === null) return null;

  const maxBudgetUSD = typeof t.maxBudgetUSD === "number" ? t.maxBudgetUSD : null;
  const stuckTurnsThreshold =
    typeof t.stuckTurnsThreshold === "number" ? t.stuckTurnsThreshold : null;
  const acceptanceRateFloor =
    typeof t.acceptanceRateFloor === "number" ? t.acceptanceRateFloor : null;
  const maxRetries =
    typeof t.maxRetries === "number" ? t.maxRetries : null;
  const meanCloseHoursTarget =
    typeof t.meanCloseHoursTarget === "number" ? t.meanCloseHoursTarget : null;
  const agentMergeShareTarget =
    typeof t.agentMergeShareTarget === "number" ? t.agentMergeShareTarget : null;

  if (
    maxBudgetUSD === null ||
    stuckTurnsThreshold === null ||
    acceptanceRateFloor === null ||
    maxRetries === null ||
    meanCloseHoursTarget === null ||
    agentMergeShareTarget === null
  ) {
    return null;
  }

  return {
    acceptanceRateFloor,
    maxBudgetUSD,
    maxRetries,
    stuckTurnsThreshold,
    meanCloseHoursTarget,
    agentMergeShareTarget,
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
 *   - The file is malformed
 *   - Any field is missing or has the wrong type
 *
 * Callers should treat null as "use hard-coded defaults" — this function
 * never throws.
 */
export function loadQaTuning(repoPath: string): QaTuningThresholds | null {
  const configPath = resolve(repoPath, CONFIG_FILENAME);

  if (!existsSync(configPath)) return null;

  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    return parseThresholds(raw);
  } catch {
    return null;
  }
}
