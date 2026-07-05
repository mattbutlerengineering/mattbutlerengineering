#!/usr/bin/env node

/**
 * Threshold auto-tuner for the improvement flywheel.
 *
 * Reads per-sensor verification results from .claude/improvement-loop/verifications.jsonl
 * and adjusts two independent concerns from them:
 *
 *   1. Sensor sensitivity in .github/auto-qa-tuning.json (original concern).
 *   2. Per-sensor regression thresholds in .github/regression-tunables.json
 *      (ADR-018 seam, #2986) — read via sensors-registry.mjs's
 *      getTunableSensorDefaults()/readTunables(), written back to the
 *      sidecar that buildThresholds() overlays at read time.
 *
 * Sensitivity decision rules:
 *   FP rate > 30%               → loosen sensitivity by 5%
 *   effectiveness < 50%         → tighten sensitivity by 5%
 *   FP rate < 10% AND eff > 80% → tighten sensitivity by 3%
 *
 * Sensitivity guard rails:
 *   - Max 10% change per threshold per week (from the threshold-changes metric history)
 *   - Sensitivity never drops below SENSOR_FLOORS (prevents disabling a sensor)
 *   - Sensitivity capped at 2.0 (prevents runaway tightening)
 *   - Minimum 3 data points required before tuning a sensor
 *
 * Regression-threshold decision rule (ADR-018): the same per-sensor
 * fpRate/effectiveness metrics are classified into false_positive (widen,
 * reduce noise) / miss (tighten, catch what slipped through) / ok
 * (unchanged), hard-clamped to ±50% of the sensor's registry default.
 *
 * Usage:
 *   node scripts/threshold-tuner.mjs           # tune and persist
 *   node scripts/threshold-tuner.mjs --dry-run # print only
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getSensorByLabel,
  getTunableSensorDefaults,
  readTunables,
  clampToDefaultRange,
  REGRESSION_TUNABLES_PATH,
} from "./sensors-registry.mjs";
import { read, append } from "./metrics-store.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TUNING_PATH = resolve(ROOT, ".github", "auto-qa-tuning.json");
const VERIFICATIONS_PATH = resolve(ROOT, ".claude", "improvement-loop", "verifications.jsonl");

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
 * @param {object[]} changesLog  — entries from the threshold-changes metric
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
 * @param {object[]} changesLog       — entries from the threshold-changes metric
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

// ── Regression-threshold tuning (ADR-018, #2986) ───────

/**
 * Classifies a sensor's per-sensor verification metrics (the same
 * fpRate/effectiveness shape computePerSensorMetrics produces for
 * sensitivity tuning above) into a regression-threshold tuning outcome.
 *
 * @param {{ fpRate: number, effectiveness: number }} metrics
 * @returns {"false_positive" | "miss" | "ok"}
 */
export function classifyRegressionOutcome({ fpRate, effectiveness }) {
  if (fpRate > 0.3) return "false_positive";
  if (effectiveness < 0.5) return "miss";
  return "ok";
}

/** Fractional step (of the registry default) applied per tuning cycle. */
export const REGRESSION_TUNE_STEP_FRACTION = 0.1;

/**
 * Pure regression-threshold tuning policy (ADR-018): widens after a
 * confirmed false positive (reduces noise), tightens after a confirmed
 * miss (catches regressions that slipped through), leaves the threshold
 * unchanged on "ok". Hard-clamped to ±50% of the registry default via
 * sensors-registry.mjs's clampToDefaultRange, so a sensor can never be
 * tuned into disabled (too wide) or hair-trigger (too tight) — including
 * if `currentThreshold` itself arrives already out of bounds (e.g. a
 * hand-edited sidecar).
 *
 * @param {number} currentThreshold
 * @param {number} defaultThreshold
 * @param {"false_positive" | "miss" | "ok"} outcome
 * @returns {number}
 */
export function tuneRegressionThreshold(currentThreshold, defaultThreshold, outcome) {
  const step = defaultThreshold * REGRESSION_TUNE_STEP_FRACTION;
  const next =
    outcome === "false_positive"
      ? currentThreshold + step
      : outcome === "miss"
        ? currentThreshold - step
        : currentThreshold;
  const clamped = clampToDefaultRange(next, defaultThreshold);
  return Math.round(clamped * 10000) / 10000;
}

/**
 * Tunes each tunable sensor's regression threshold from verification
 * metrics, reading current/default values via the registry seam
 * (`tunableDefaults` — sensors-registry.mjs's getTunableSensorDefaults(),
 * per-entry, not the flat buildThresholds() blob) and returning the
 * updated sidecar contents plus a changes list for the audit log.
 *
 * @param {Record<string, { regressionThreshold: number }>} tunables — current sidecar contents
 * @param {Record<string, { fpRate: number, effectiveness: number, total: number }>} perSensorMetrics — keyed by issue label (verifications.jsonl's sensor_label)
 * @param {(label: string) => { id: string } | null} resolveSensor — getSensorByLabel
 * @param {Record<string, { thresholdKey: string, defaultValue: number }>} tunableDefaults — getTunableSensorDefaults()
 * @param {string} today
 * @returns {{ tunables: object, changes: object[] }}
 */
export function applyRegressionThresholdAdjustments(
  tunables,
  perSensorMetrics,
  resolveSensor,
  tunableDefaults,
  today
) {
  const updated = { ...tunables };
  /** @type {object[]} */
  const changes = [];

  for (const [label, metrics] of Object.entries(perSensorMetrics)) {
    if (metrics.total < 3) continue;

    const sensor = resolveSensor(label);
    const tunable = sensor && tunableDefaults[sensor.id];
    if (!tunable) continue;

    const outcome = classifyRegressionOutcome(metrics);
    if (outcome === "ok") continue;

    const currentThreshold = updated[sensor.id]?.regressionThreshold ?? tunable.defaultValue;
    const newThreshold = tuneRegressionThreshold(currentThreshold, tunable.defaultValue, outcome);
    if (newThreshold === currentThreshold) continue;

    updated[sensor.id] = { regressionThreshold: newThreshold };
    changes.push({
      date: today,
      threshold: `${sensor.id}.${tunable.thresholdKey}`,
      oldValue: currentThreshold,
      newValue: newThreshold,
      trigger: outcome === "false_positive" ? "regression-false-positive" : "regression-miss",
      evidence: `${sensor.id} regression threshold: ${outcome} (fpRate ${(metrics.fpRate * 100).toFixed(1)}%, effectiveness ${(metrics.effectiveness * 100).toFixed(1)}%)`,
    });
  }

  return { tunables: updated, changes };
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

  // process-metrics is optional — log if absent, but don't fail
  const processMetrics = read("process-metrics") ?? [];
  if (processMetrics.length === 0) {
    console.log("[threshold-tuner] No process-metrics.jsonl found — using verification log only");
  }

  const perSensorMetrics = computePerSensorMetrics(verifications);

  if (Object.keys(perSensorMetrics).length === 0) {
    console.log("[threshold-tuner] No per-sensor metrics computed — skipping tuning");
    return { changes: [] };
  }

  const tuning = readJson(TUNING_PATH);
  const changesLog = read("threshold-changes") ?? [];
  const today = isoDate();

  const { tuning: updatedTuning, changes } = applyAdjustments(
    tuning,
    perSensorMetrics,
    changesLog,
    today
  );

  // Regression-threshold tuning (ADR-018, #2986) — independent of sensitivity
  // tuning above; reads/writes the sidecar via the registry seam.
  const tunables = readTunables();
  const { tunables: updatedTunables, changes: regressionChanges } =
    applyRegressionThresholdAdjustments(
      tunables,
      perSensorMetrics,
      getSensorByLabel,
      getTunableSensorDefaults(),
      today
    );

  const allChanges = [...changes, ...regressionChanges];

  if (allChanges.length === 0) {
    console.log("[threshold-tuner] No threshold adjustments needed");
    return { changes: [] };
  }

  if (dryRun) {
    console.log("[threshold-tuner] DRY RUN — would make these adjustments:");
    for (const c of allChanges) {
      console.log(`  ${c.threshold}: ${c.oldValue} → ${c.newValue} (${c.trigger})`);
    }
    return { changes: allChanges };
  }

  if (changes.length > 0) {
    writeJson(TUNING_PATH, updatedTuning);
  }
  if (regressionChanges.length > 0) {
    writeJson(REGRESSION_TUNABLES_PATH, updatedTunables);
  }

  // Append each change to the audit log in ACMM-canonical format
  if (allChanges.length > 0) {
    for (const change of allChanges) {
      append("threshold-changes", buildJsonlEntry(change));
    }
  }

  console.log(`[threshold-tuner] Applied ${allChanges.length} threshold adjustment(s):`);
  for (const c of allChanges) {
    console.log(`  ${c.threshold}: ${c.oldValue} → ${c.newValue} (${c.trigger})`);
  }

  return { changes: allChanges };
}

// Run when invoked directly (not imported by tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes("--dry-run");
  run({ dryRun }).catch((err) => {
    process.stderr.write(`[threshold-tuner] Error: ${err.message}\n`);
    process.exit(1);
  });
}
