#!/usr/bin/env node

/**
 * Auto-QA threshold tuner — closes the L3-to-L4 adaptive loop.
 *
 * Reads PR acceptance snapshots from docs/metrics/pr-acceptance.json and
 * adjusts thresholds in .github/auto-qa-tuning.json. Each tuning event
 * appends a history entry explaining *why* the adjustment was made, not
 * just what changed.
 *
 * Usage:
 *   node plugins/acmm/scripts/auto-qa-tune.js            # apply tuning
 *   node plugins/acmm/scripts/auto-qa-tune.js --dry-run   # preview only
 *
 * Design constraints:
 *   - Budget can only be *lowered* (never raised) by the tuner. Raising
 *     the budget requires a human decision.
 *   - Minimum budget floor is $0.25 to prevent the tuner from starving
 *     agents entirely.
 *   - If the most recent snapshot has no data (total_ai_prs === 0), the
 *     tuner skips with a "no signal" history entry.
 *   - Requires at least 5 total PRs in the most recent snapshot before
 *     acting on acceptance rate — small samples produce noisy rates.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BUDGET_FLOOR = 0.25;
const BUDGET_REDUCTION_FACTOR = 0.75;
const MIN_SAMPLE_SIZE = 5;

// ---------------------------------------------------------------------------
// Pure functions (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Pick the most recent snapshot from the pr-acceptance array.
 * Returns null if the array is empty or has no valid entries.
 *
 * @param {Array<{date: string}>} snapshots
 * @returns {{date: string, window_days: number, total_ai_prs: number, merged: number, rejected: number, acceptance_rate: number} | null}
 */
export function latestSnapshot(snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) return null;
  const sorted = [...snapshots].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  return sorted[0] ?? null;
}

/**
 * Compute threshold adjustments from a single PR-acceptance snapshot.
 *
 * Returns an object with the (potentially unchanged) thresholds and an
 * array of human-readable adjustment rationale strings.
 *
 * @param {{total_ai_prs: number, merged: number, rejected: number, acceptance_rate: number}} snapshot
 * @param {{acceptanceRateFloor: number, maxBudgetUSD: number}} thresholds
 * @returns {{thresholds: {acceptanceRateFloor: number, maxBudgetUSD: number}, adjustments: string[]}}
 */
export function computeAdjustments(snapshot, thresholds) {
  const adjustments = [];
  const next = { ...thresholds };

  // Gate: insufficient data
  if (snapshot.total_ai_prs < MIN_SAMPLE_SIZE) {
    adjustments.push(
      `Insufficient data: only ${snapshot.total_ai_prs} AI PRs in window (need >= ${MIN_SAMPLE_SIZE}). No adjustments made.`
    );
    return { thresholds: next, adjustments };
  }

  const rate = snapshot.acceptance_rate;
  const floor = thresholds.acceptanceRateFloor;

  if (rate < floor) {
    const oldBudget = next.maxBudgetUSD;
    const newBudget = Math.max(BUDGET_FLOOR, +(oldBudget * BUDGET_REDUCTION_FACTOR).toFixed(2));
    next.maxBudgetUSD = newBudget;

    const pct = (rate * 100).toFixed(0);
    const floorPct = (floor * 100).toFixed(0);
    adjustments.push(
      `Acceptance rate ${pct}% is below the ${floorPct}% floor ` +
        `(${snapshot.merged} merged, ${snapshot.rejected} rejected out of ${snapshot.total_ai_prs} PRs). ` +
        `Budget reduced from $${oldBudget.toFixed(2)} to $${newBudget.toFixed(2)} ` +
        `to tighten quality gate — agents that cost more should produce higher-quality PRs.`
    );
  }

  if (adjustments.length === 0) {
    const pct = (rate * 100).toFixed(0);
    const floorPct = (floor * 100).toFixed(0);
    adjustments.push(
      `Acceptance rate ${pct}% meets or exceeds the ${floorPct}% floor ` +
        `(${snapshot.merged} merged, ${snapshot.rejected} rejected). No adjustments needed.`
    );
  }

  return { thresholds: next, adjustments };
}

/**
 * Build a complete history entry for this tuning run.
 *
 * @param {{adjustments: string[], date: string, snapshotDate: string}} params
 * @returns {{date: string, trigger: string, snapshotDate: string, adjustments: string[], note: string}}
 */
export function buildHistoryEntry({ adjustments, date, snapshotDate }) {
  const changed = adjustments.some(
    (a) => !a.includes("No adjustments") && !a.includes("Insufficient data")
  );
  return {
    date,
    trigger: "auto-qa-tune",
    snapshotDate,
    adjustments,
    note: changed
      ? `Tuned thresholds based on PR acceptance data from ${snapshotDate}. ${adjustments.length} finding(s).`
      : `Reviewed PR acceptance data from ${snapshotDate}. All metrics within acceptable ranges.`,
  };
}

// ---------------------------------------------------------------------------
// IO (side-effectful main — not exported for tests)
// ---------------------------------------------------------------------------

function main() {
  const DRY_RUN = process.argv.includes("--dry-run");
  const cwd = process.cwd();
  const configPath = resolve(cwd, ".github/auto-qa-tuning.json");
  const metricsPath = resolve(cwd, "docs/metrics/pr-acceptance.json");

  // --- Read config ---
  if (!existsSync(configPath)) {
    console.error(`Config not found: ${configPath}`);
    process.exit(1);
  }
  const config = JSON.parse(readFileSync(configPath, "utf-8"));

  // --- Read metrics ---
  if (!existsSync(metricsPath)) {
    console.log("No PR acceptance metrics found at", metricsPath, "— skipping.");
    process.exit(0);
  }
  const snapshots = JSON.parse(readFileSync(metricsPath, "utf-8"));
  const snapshot = latestSnapshot(snapshots);

  if (!snapshot) {
    console.log("PR acceptance metrics file is empty. Skipping tuning.");
    process.exit(0);
  }

  // --- Compute ---
  const today = new Date().toISOString().split("T")[0];
  const { thresholds: adjusted, adjustments } = computeAdjustments(snapshot, config.thresholds);

  const historyEntry = buildHistoryEntry({
    adjustments,
    date: today,
    snapshotDate: snapshot.date,
  });

  // --- Apply ---
  const updatedConfig = {
    ...config,
    lastTunedAt: today,
    thresholds: { ...config.thresholds, ...adjusted },
    history: [...config.history, historyEntry],
  };

  if (DRY_RUN) {
    console.log("DRY RUN — would write this history entry:");
    console.log(JSON.stringify(historyEntry, null, 2));
    if (adjusted.maxBudgetUSD !== config.thresholds.maxBudgetUSD) {
      console.log(
        `\nBudget would change: $${config.thresholds.maxBudgetUSD} -> $${adjusted.maxBudgetUSD}`
      );
    }
    process.exit(0);
  }

  writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2) + "\n");
  console.log(`Auto-QA tuning complete. ${adjustments.length} finding(s). History entry added.`);
  for (const a of adjustments) {
    console.log(`  - ${a}`);
  }
}

// Only run main() when executed directly, not when imported by tests.
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main();
}
