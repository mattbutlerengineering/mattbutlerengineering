import { routeModel } from "./model-router.js";
import type { IssueInput, ModelTier } from "./model-router.js";

// ── Types ───────────────────────────────────────────────────────────

/**
 * One historical row from `metrics/queue-telemetry.jsonl` (written by
 * `appendTelemetryRow` in `scripts/collect-queue-telemetry.mjs`). Only the
 * fields this estimator reads are typed; other schema fields are ignored.
 *
 * This is external, untrusted data: every field is optional/nullable and the
 * estimator validates each value before use (see `finiteTokens`).
 */
export interface TelemetryRow {
  readonly issue_number: number;
  readonly labels?: string[];
  readonly model_tier?: string;
  readonly subagent_tokens?: number;
  readonly cost_usd?: number | null;
}

export interface TokenEstimate {
  readonly estimatedTokens: number;
  readonly estimatedCostUsd: number;
  readonly confidence: "low" | "medium" | "high";
  /** Human-readable explanation of which fallback tier produced the estimate. */
  readonly basis: string;
}

// ── Constants ───────────────────────────────────────────────────────

/**
 * Blended USD price per million tokens, per tier. These are rough blended
 * averages across input/output/cache (subagent_tokens is a single total, not
 * split by kind) used only to derive a cost when a row has no precise
 * `cost_usd`. They are deliberately conservative; precise per-issue cost comes
 * from `cost_usd` once workers populate it.
 */
export const PER_TIER_COST_PER_MTOK_USD: Readonly<Record<ModelTier, number>> = {
  haiku: 2,
  sonnet: 6,
  opus: 30,
};

/**
 * Documented per-tier default token counts used as the final cold-start
 * fallback when there is no historical data for a tier. Anchored to observed
 * queue telemetry (sonnet issues land around ~150–220k tokens).
 */
export const PER_TIER_DEFAULT_TOKENS: Readonly<Record<ModelTier, number>> = {
  haiku: 60_000,
  sonnet: 180_000,
  opus: 300_000,
};

/**
 * Minimum number of same-tier, label-overlapping rows required before the
 * tier+label bucket is trusted for a "high" confidence estimate.
 */
export const MIN_HIGH_CONFIDENCE_ROWS = 3;

// ── Public API ───────────────────────────────────────────────────────

/**
 * Estimate the expected token usage (and USD cost) for an unstarted issue from
 * historical queue telemetry.
 *
 * Pure function — history is injected (no `fs`/network). Bucketing key is the
 * routed model tier (shared with `routeModel`) plus label overlap. Returns the
 * MEDIAN `subagent_tokens` of the matching bucket (median, not mean — token
 * distributions are long-tailed).
 *
 * Cold-start fallback chain (never throws):
 *   1. tier + label bucket with ≥ MIN_HIGH_CONFIDENCE_ROWS rows → confidence "high"
 *   2. per-tier global median (≥ 1 row of that tier)           → confidence "medium"
 *   3. documented per-tier default constant                    → confidence "low"
 */
export function estimateIssueTokens(issue: IssueInput, history: TelemetryRow[]): TokenEstimate {
  const tier = routeModel(issue);
  const issueLabels = new Set(issue.labels.map((l) => l.toLowerCase()));

  const tierRows = history.filter((row) => row.model_tier === tier && finiteTokens(row));

  // 1. Tier + label-overlap bucket.
  const bucket = tierRows.filter((row) => hasLabelOverlap(row, issueLabels));
  if (bucket.length >= MIN_HIGH_CONFIDENCE_ROWS) {
    return buildEstimate(bucket, tier, "high", `tier+label bucket (${bucket.length} ${tier} rows)`);
  }

  // 2. Per-tier global median.
  if (tierRows.length > 0) {
    return buildEstimate(
      tierRows,
      tier,
      "medium",
      `per-tier median (${tierRows.length} ${tier} rows, no label-matched bucket)`
    );
  }

  // 3. Documented per-tier default constant.
  const estimatedTokens = PER_TIER_DEFAULT_TOKENS[tier];
  return {
    estimatedTokens,
    estimatedCostUsd: tokensToCost(estimatedTokens, tier),
    confidence: "low",
    basis: `per-tier default (no ${tier} history)`,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Build an estimate from a non-empty set of validated rows. */
function buildEstimate(
  rows: TelemetryRow[],
  tier: ModelTier,
  confidence: TokenEstimate["confidence"],
  basis: string
): TokenEstimate {
  const estimatedTokens = Math.round(median(rows.map((r) => r.subagent_tokens as number)));

  const costs = rows
    .map((r) => r.cost_usd)
    .filter((c): c is number => typeof c === "number" && Number.isFinite(c));
  const estimatedCostUsd = costs.length > 0 ? median(costs) : tokensToCost(estimatedTokens, tier);

  return { estimatedTokens, estimatedCostUsd, confidence, basis };
}

/** True when the row shares at least one label with the issue. */
function hasLabelOverlap(row: TelemetryRow, issueLabels: Set<string>): boolean {
  if (!Array.isArray(row.labels)) return false;
  return row.labels.some((l) => typeof l === "string" && issueLabels.has(l.toLowerCase()));
}

/** True when the row carries a usable positive token count. */
function finiteTokens(row: TelemetryRow): boolean {
  return (
    typeof row.subagent_tokens === "number" &&
    Number.isFinite(row.subagent_tokens) &&
    row.subagent_tokens > 0
  );
}

/** Derive a USD cost from a token count using the per-tier blended rate. */
function tokensToCost(tokens: number, tier: ModelTier): number {
  return (tokens / 1_000_000) * PER_TIER_COST_PER_MTOK_USD[tier];
}

/** Median of a non-empty numeric array (average of the two middles when even). */
function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}
