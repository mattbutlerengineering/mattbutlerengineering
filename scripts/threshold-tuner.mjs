#!/usr/bin/env node

/**
 * Threshold auto-tuner for the improvement flywheel.
 *
 * Reads per-sensor verification results from .claude/improvement-loop/verifications.jsonl
 * and adjusts sensor sensitivity thresholds in .github/auto-qa-tuning.json.
 *
 * Decision rules:
 *   FP rate > 30%               → loosen sensitivity by 5%
 *   effectiveness < 50%         → tighten sensitivity by 5%
 *   FP rate < 10% AND eff > 80% → tighten sensitivity by 3%
 *
 * Guard rails:
 *   - Max 10% change per threshold per week (from metrics/threshold-changes.jsonl history)
 *   - Sensitivity never drops below SENSOR_FLOORS (prevents disabling a sensor)
 *   - Sensitivity capped at 2.0 (prevents runaway tightening)
 *   - Minimum 3 data points required before tuning a sensor
 *
 * Usage:
 *   node scripts/threshold-tuner.mjs           # tune and persist
 *   node scripts/threshold-tuner.mjs --dry-run # print only
 */

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TUNING_PATH = resolve(ROOT, ".github", "auto-qa-tuning.json");
const CHANGES_LOG_PATH = resolve(ROOT, "metrics", "threshold-changes.jsonl");
const VERIFICATIONS_PATH = resolve(ROOT, ".claude", "improvement-loop", "verifications.jsonl");
const METRICS_PATH = resolve(ROOT, "metrics", "process-metrics.jsonl");

/** Sensor labels the tuner knows about */
const SENSOR_LABELS = ["ci-fix", "audit", "acmm", "sentry", "bug"];

/**
 * Hard minimum sensitivity per sensor.
 * Prevents a sensor from being fully disabled by auto-tuning.
 */
const SENSOR_FLOORS = {
  "ci-fix": 0.1,
  acmm: 0.1,
  audit: 0.1,
  sentry: 0.1,
  bug: 0.1,
};

// ── Pure helpers ──────────────────────────────────────

function safe(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

// ── Pure functions (exported for testing) ─────────────

/**
 * Compute per-sensor FP rate and effectiveness from verification log entries.
 *
 * FP rate     = unverified / total  (higher → too many false positives)
 * effectiveness = verified / total  (higher → sensor is finding real issues)
 *
 * Entries with `confidence: "skip"` are excluded (not enough info to classify).
 * Only entries within `lookbackDays` are included.
 *
 * @param {object[]} verifications  — entries from verifications.jsonl
 * @param {number}   lookbackDays   — default 30
 * @returns {Record<string, { fpRate: number, effectiveness: number, total: number, verified: number }>}
 */
export function computePerSensorMetrics(verifications, lookbackDays = 30, now = Date.now()) {
  const cutoff = new Date(now - lookbackDays * 24 * 60 * 60 * 1000);

  const bySensor = {};

  for (const v of verifications) {
    if (!v.timestamp) continue;
    if (v.confidence === "skip") continue;
    if (new Date(v.timestamp) < cutoff) continue;

    const label = v.sensor_label;
    if (!label || !SENSOR_LABELS.includes(label)) continue;

    if (!bySensor[label]) bySensor[label] = { total: 0, verified: 0 };
    bySensor[label].total++;
    if (v.verified) bySensor[label].verified++;
  }

  /** @type {Record<string, { fpRate: number, effectiveness: number, total: number, verified: number }>} */
  const metrics = {};
  for (const [label, counts] of Object.entries(bySensor)) {
    if (counts.total === 0) continue;
    const effectiveness = counts.verified / counts.total;
    metrics[label] = {
      effectiveness,
      fpRate: 1 - effectiveness,
      total: counts.total,
      verified: counts.verified,
    };
  }

  return metrics;
}

/**
 * Compute the total fractional change applied to a sensor in the last 7 days.
 * Used to enforce the 10%/week guard rail.
 *
 * @param {object[]} changesLog  — entries from metrics/threshold-changes.jsonl
 * @param {string}   sensorLabel
 * @returns {number}  sum of |Δ / oldValue| for recent entries
 */
export function computeWeeklyChange(changesLog, sensorLabel) {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  let total = 0;

  for (const c of changesLog) {
    // Accept both ACMM-canonical (criterion) and legacy (threshold) field names
    const label = c.criterion ?? c.threshold;
    if (label !== sensorLabel) continue;
    const dateStr = c.timestamp ?? c.date;
    if (!dateStr) continue;
    if (new Date(dateStr) < cutoff) continue;
    const oldVal = c.old_value ?? c.oldValue;
    const newVal = c.new_value ?? c.newValue;
    if (oldVal === 0) continue; // guard against division by zero
    total += Math.abs((newVal - oldVal) / oldVal);
  }

  return total;
}

/**
 * Apply the three decision rules to determine whether and how to adjust a
 * sensor's sensitivity threshold.
 *
 * Rules are evaluated in priority order (first match wins):
 *   1. FP rate > 30%               → loosen by 5%  (delta = -0.05)
 *   2. Effectiveness < 50%         → tighten by 5% (delta = +0.05)
 *   3. FP rate < 10% AND eff > 80% → tighten by 3% (delta = +0.03)
 *   4. (none match)                → no change
 *
 * @param {{ fpRate: number, effectiveness: number }} metrics
 * @returns {{ delta: number, trigger: string, evidence: string } | null}
 */
export function determineAdjustment(metrics) {
  const { fpRate, effectiveness } = metrics;

  // Rule 1 — too many false positives: loosen
  if (fpRate > 0.3) {
    return {
      delta: -0.05,
      trigger: "high-fp-rate",
      evidence: `FP rate ${(fpRate * 100).toFixed(1)}% > 30% — loosen threshold by 5%`,
    };
  }

  // Rule 2 — missing real issues: tighten
  if (effectiveness < 0.5) {
    return {
      delta: 0.05,
      trigger: "low-effectiveness",
      evidence: `Effectiveness ${(effectiveness * 100).toFixed(1)}% < 50% — tighten threshold by 5%`,
    };
  }

  // Rule 3 — headroom available: tighten gently
  if (fpRate < 0.1 && effectiveness > 0.8) {
    return {
      delta: 0.03,
      trigger: "headroom",
      evidence: `FP rate ${(fpRate * 100).toFixed(1)}% < 10% AND effectiveness ${(effectiveness * 100).toFixed(1)}% > 80% — tighten by 3%`,
    };
  }

  return null;
}

/**
 * Apply per-sensor threshold adjustments to the tuning config.
 *
 * Guard rails enforced here:
 *   - Minimum 3 data points per sensor before any adjustment
 *   - Max 10% fractional change per sensor per week
 *   - Sensitivity never drops below SENSOR_FLOORS[label] (default 0.1)
 *   - Sensitivity never exceeds 2.0
 *
 * @param {object}   tuning           — current auto-qa-tuning.json contents
 * @param {Record<string, { fpRate: number, effectiveness: number, total: number }>} perSensorMetrics
 * @param {object[]} changesLog       — entries from threshold-changes.jsonl
 * @param {string}   today            — ISO date (YYYY-MM-DD)
 * @returns {{ tuning: object, changes: object[] }}
 */
export function applyAdjustments(tuning, perSensorMetrics, changesLog, today) {
  if (Object.keys(perSensorMetrics).length === 0) {
    return { tuning, changes: [] };
  }

  const sensorSensitivity = { ...(tuning.sensorSensitivity ?? {}) };
  /** @type {object[]} */
  const appliedChanges = [];

  for (const [sensorLabel, metrics] of Object.entries(perSensorMetrics)) {
    // Require at least 3 data points to avoid tuning on noise
    if (metrics.total < 3) continue;

    const adjustment = determineAdjustment(metrics);
    if (!adjustment) continue;

    const oldValue =
      typeof sensorSensitivity[sensorLabel] === "number" ? sensorSensitivity[sensorLabel] : 1.0;

    const floor = SENSOR_FLOORS[sensorLabel] ?? 0.1;

    // Guard rail: weekly cap at 10%
    const weeklyChange = computeWeeklyChange(changesLog, sensorLabel);
    if (weeklyChange >= 0.1) continue; // budget exhausted

    const remainingBudget = 0.1 - weeklyChange;
    const clampedDelta =
      Math.sign(adjustment.delta) * Math.min(Math.abs(adjustment.delta), remainingBudget);

    // Apply delta, then clamp to [floor, 2.0]
    let newValue = Math.max(floor, Math.min(2.0, oldValue + clampedDelta));

    // Round to 3 decimal places to avoid floating-point noise
    newValue = Math.round(newValue * 1000) / 1000;

    if (newValue === oldValue) continue; // guard rail absorbed full delta (at floor)

    sensorSensitivity[sensorLabel] = newValue;
    appliedChanges.push({
      date: today,
      threshold: sensorLabel,
      oldValue,
      newValue,
      trigger: adjustment.trigger,
      evidence: adjustment.evidence,
    });
  }

  if (appliedChanges.length === 0) {
    return { tuning, changes: [] };
  }

  const historyEntry = {
    date: today,
    trigger: "threshold-auto-tuner",
    adjustments: appliedChanges.map(
      (c) => `${c.threshold}: ${c.oldValue} → ${c.newValue} (${c.trigger})`
    ),
    note: `Auto-tuned ${appliedChanges.length} sensor threshold(s) from verification results: ${appliedChanges.map((c) => c.threshold).join(", ")}.`,
  };

  const updatedTuning = {
    ...tuning,
    lastTunedAt: today,
    sensorSensitivity,
    history: [...(tuning.history ?? []), historyEntry],
  };

  return { tuning: updatedTuning, changes: appliedChanges };
}

/**
 * Convert an internal change record to the ACMM-canonical JSONL format.
 *
 * Internal fields:  date, threshold, oldValue, newValue, trigger, evidence
 * ACMM fields:      timestamp, criterion, old_value, new_value, trigger
 *
 * @param {{ date: string, threshold: string, oldValue: number, newValue: number, trigger: string, evidence?: string }} change
 * @returns {{ timestamp: string, criterion: string, old_value: number, new_value: number, trigger: string }}
 */
export function buildJsonlEntry(change) {
  return {
    timestamp: new Date(change.date).toISOString(),
    criterion: change.threshold,
    old_value: change.oldValue,
    new_value: change.newValue,
    trigger: change.trigger,
  };
}

// ── I/O helpers ───────────────────────────────────────

function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => safe(() => JSON.parse(l)))
    .filter(Boolean);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function writeJson(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

// ── Main entry ────────────────────────────────────────

/**
 * Run the threshold auto-tuner.
 *
 * @param {{ dryRun?: boolean }} options
 * @returns {Promise<{ changes: object[] }>}
 */
export async function run({ dryRun = false } = {}) {
  const verifications = readJsonl(VERIFICATIONS_PATH);

  if (verifications.length === 0) {
    console.log("[threshold-tuner] No verification data — skipping tuning");
    return { changes: [] };
  }

  // process-metrics.jsonl is optional — log if absent, but don't fail
  const processMetrics = readJsonl(METRICS_PATH);
  if (processMetrics.length === 0) {
    console.log("[threshold-tuner] No process-metrics.jsonl found — using verification log only");
  }

  const perSensorMetrics = computePerSensorMetrics(verifications);

  if (Object.keys(perSensorMetrics).length === 0) {
    console.log("[threshold-tuner] No per-sensor metrics computed — skipping tuning");
    return { changes: [] };
  }

  const tuning = readJson(TUNING_PATH);
  const changesLog = readJsonl(CHANGES_LOG_PATH);
  const today = isoDate();

  const { tuning: updatedTuning, changes } = applyAdjustments(
    tuning,
    perSensorMetrics,
    changesLog,
    today
  );

  if (changes.length === 0) {
    console.log("[threshold-tuner] No threshold adjustments needed");
    return { changes: [] };
  }

  if (dryRun) {
    console.log("[threshold-tuner] DRY RUN — would make these adjustments:");
    for (const c of changes) {
      console.log(`  ${c.threshold}: ${c.oldValue} → ${c.newValue} (${c.trigger})`);
    }
    return { changes };
  }

  // Persist tuning config
  writeJson(TUNING_PATH, updatedTuning);

  // Append each change to the audit log in ACMM-canonical format
  mkdirSync(dirname(CHANGES_LOG_PATH), { recursive: true });
  for (const change of changes) {
    const entry = buildJsonlEntry(change);
    appendFileSync(CHANGES_LOG_PATH, JSON.stringify(entry) + "\n");
  }

  console.log(`[threshold-tuner] Applied ${changes.length} threshold adjustment(s):`);
  for (const c of changes) {
    console.log(`  ${c.threshold}: ${c.oldValue} → ${c.newValue} (${c.trigger})`);
  }

  return { changes };
}

// Run when invoked directly (not imported by tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes("--dry-run");
  run({ dryRun }).catch((err) => {
    process.stderr.write(`[threshold-tuner] Error: ${err.message}\n`);
    process.exit(1);
  });
}
