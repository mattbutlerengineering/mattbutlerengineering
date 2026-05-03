#!/usr/bin/env node

/**
 * Auto-QA threshold tuner for the agent QA loop.
 *
 * Reads docs/metrics/pr-acceptance.json, computes per-category acceptance
 * rates, and adjusts maxBudgetUSD overrides in .github/auto-qa-tuning.json
 * when a category falls below acceptanceRateFloor.
 *
 * Usage:
 *   node scripts/auto-qa-tune.mjs
 *   node scripts/auto-qa-tune.mjs --dry-run
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const cwd = process.cwd();
const METRICS_PATH = join(cwd, 'docs/metrics/pr-acceptance.json');
const TUNING_PATH = join(cwd, '.github/auto-qa-tuning.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// ---------------------------------------------------------------------------
// I/O helpers
// ---------------------------------------------------------------------------

/** @returns {unknown} */
function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

/** @param {string} filePath @param {unknown} data */
function writeJson(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// Acceptance-rate computation
// ---------------------------------------------------------------------------

/**
 * Compute acceptance rate for a single metrics entry.
 * Falls back to the top-level `acceptance_rate` when no per-category data exists.
 *
 * @param {object} entry - one entry from pr-acceptance.json
 * @returns {{ overall: number, byCategory: Record<string, number> }}
 */
export function computeAcceptanceRates(entry) {
  const overall = typeof entry.acceptance_rate === 'number' ? entry.acceptance_rate : 1;

  const byCategory = {};

  if (entry.by_category && typeof entry.by_category === 'object') {
    for (const [category, stats] of Object.entries(entry.by_category)) {
      if (
        stats &&
        typeof stats === 'object' &&
        typeof stats.merged === 'number' &&
        typeof stats.total === 'number' &&
        stats.total > 0
      ) {
        byCategory[category] = stats.merged / stats.total;
      }
    }
  }

  return { overall, byCategory };
}

/**
 * Determine which rule tiers are below the floor.
 *
 * @param {Record<string, number>} byCategory
 * @param {number} floor
 * @returns {string[]} tier keys (e.g. "tier:trivial")
 */
export function tiersBelowFloor(byCategory, floor) {
  return Object.entries(byCategory)
    .filter(([, rate]) => rate < floor)
    .map(([cat]) => cat);
}

// ---------------------------------------------------------------------------
// Threshold adjustment
// ---------------------------------------------------------------------------

/**
 * Halve the maxBudgetUSD / maxBudgetUSDOverride for every tier that is below
 * the acceptance floor.  Returns an immutable copy with adjusted rules and a
 * new history entry.
 *
 * @param {object} tuning      - current auto-qa-tuning.json contents
 * @param {string[]} belowTiers - tier keys that need tightening
 * @param {string} today       - ISO date string (YYYY-MM-DD)
 * @returns {object}           - new tuning object (never mutates input)
 */
export function adjustThresholds(tuning, belowTiers, today) {
  if (belowTiers.length === 0) {
    const historyEntry = {
      date: today,
      trigger: 'auto-tune',
      note: 'All categories at or above acceptance floor. No threshold changes needed.',
    };
    return {
      ...tuning,
      lastTunedAt: today,
      history: [...tuning.history, historyEntry],
    };
  }

  const updatedRules = { ...tuning.rules };
  const changes = [];

  for (const tier of belowTiers) {
    const existing = updatedRules[tier] ?? {};
    const key = 'maxBudgetUSDOverride';
    const prev = typeof existing[key] === 'number' ? existing[key] : tuning.thresholds.maxBudgetUSD;
    const next = +(prev / 2).toFixed(2);

    updatedRules[tier] = {
      ...existing,
      [key]: next,
      [`${key}.$comment`]:
        `Auto-tuned on ${today}: acceptance rate fell below floor — halved from ${prev} to ${next}.`,
    };

    changes.push(`${tier}: maxBudgetUSDOverride ${prev} → ${next}`);
  }

  const historyEntry = {
    date: today,
    trigger: 'auto-tune',
    note: `Tightened budgets for under-performing tiers. ${changes.join('; ')}.`,
  };

  return {
    ...tuning,
    lastTunedAt: today,
    rules: updatedRules,
    history: [...tuning.history, historyEntry],
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export async function run() {
  const metricsRaw = readJson(METRICS_PATH);
  const tuning = readJson(TUNING_PATH);

  const metrics = Array.isArray(metricsRaw) ? metricsRaw : [metricsRaw];
  const latest = metrics[metrics.length - 1];

  const { overall, byCategory } = computeAcceptanceRates(latest);
  const floor = tuning.thresholds.acceptanceRateFloor;
  const today = isoDate();

  // Seed categories from rules if byCategory is empty (no per-category data yet)
  const effectiveByCategory =
    Object.keys(byCategory).length > 0
      ? byCategory
      : Object.fromEntries(Object.keys(tuning.rules).map(tier => [tier, overall]));

  const below = tiersBelowFloor(effectiveByCategory, floor);

  const updated = adjustThresholds(tuning, below, today);

  if (DRY_RUN) {
    process.stdout.write(JSON.stringify(updated, null, 2) + '\n');
    return updated;
  }

  writeJson(TUNING_PATH, updated);

  const lastEntry = updated.history[updated.history.length - 1];
  process.stdout.write(`[auto-qa-tune] ${lastEntry.note}\n`);

  return updated;
}

// Run when invoked directly (not imported by tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(err => {
    process.stderr.write(`[auto-qa-tune] Error: ${err.message}\n`);
    process.exit(1);
  });
}
