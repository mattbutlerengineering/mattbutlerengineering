/**
 * Threshold auto-tuner for the improvement flywheel.
 *
 * Reads process metrics (FP rate, effectiveness) and adjusts
 * .github/auto-qa-tuning.json thresholds with guard rails.
 *
 * Called by verify-fixes.mjs after computing verification results.
 *
 * Usage:
 *   node scripts/threshold-tuner.mjs              # tune from latest metrics
 *   node scripts/threshold-tuner.mjs --dry-run    # show adjustments without writing
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TUNING_PATH = resolve(ROOT, ".github", "auto-qa-tuning.json");
const METRICS_PATH = resolve(ROOT, "metrics", "process-metrics.jsonl");
const CHANGES_PATH = resolve(ROOT, "metrics", "threshold-changes.jsonl");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

export const HARD_FLOORS = {
  acceptanceRateFloor: 0.5,
  maxBudgetUSD: 0.25,
  maxRetries: 1,
  stuckTurnsThreshold: 3,
  meanCloseHoursTarget: 4,
};

const HARD_CEILINGS = {
  acceptanceRateFloor: 1.0,
  maxBudgetUSD: 10.0,
  maxRetries: 5,
  stuckTurnsThreshold: 20,
  meanCloseHoursTarget: 168,
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function loadThresholdHistory(changesPath) {
  if (!existsSync(changesPath)) return [];
  try {
    return readFileSync(changesPath, "utf-8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getLatestMetrics(metricsPath) {
  if (!existsSync(metricsPath)) return null;
  try {
    const lines = readFileSync(metricsPath, "utf-8")
      .split("\n")
      .filter((l) => l.trim());
    if (lines.length === 0) return null;
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

export function isWithinWeeklyLimit(thresholdName, currentValue, proposedValue, recentChanges) {
  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);
  const weekChanges = recentChanges.filter(
    (c) => c.threshold === thresholdName && new Date(c.date) >= sevenDaysAgo
  );

  let totalChange = Math.abs(proposedValue - currentValue);
  for (const c of weekChanges) {
    totalChange += Math.abs(c.newValue - c.oldValue);
  }

  const maxChange = Math.abs(currentValue) * 0.1;
  return totalChange <= maxChange;
}

function clamp(value, thresholdName) {
  const floor = HARD_FLOORS[thresholdName] ?? 0;
  const ceiling = HARD_CEILINGS[thresholdName] ?? Infinity;
  return Math.max(floor, Math.min(ceiling, value));
}

function round(value, decimals = 4) {
  return Math.round(value * 10 ** decimals) / 10 ** decimals;
}

export function computeAdjustments(metrics, currentThresholds, recentChanges) {
  if (!metrics || metrics.fp_rate === null || metrics.agent_success_rate === null) {
    return [];
  }

  const adjustments = [];
  const fpRate = metrics.fp_rate;
  const effectiveness = metrics.agent_success_rate;

  if (fpRate > 30) {
    const oldValue = currentThresholds.acceptanceRateFloor;
    let newValue = round(oldValue * 0.95);
    newValue = clamp(newValue, "acceptanceRateFloor");
    if (
      newValue !== oldValue &&
      isWithinWeeklyLimit("acceptanceRateFloor", oldValue, newValue, recentChanges)
    ) {
      adjustments.push({
        threshold: "acceptanceRateFloor",
        oldValue,
        newValue,
        direction: "loosen",
        trigger: "fp_rate > 30%",
        evidence: `FP rate: ${fpRate}%`,
      });
    }
  } else if (effectiveness < 50) {
    const oldValue = currentThresholds.acceptanceRateFloor;
    let newValue = round(oldValue * 1.05);
    newValue = clamp(newValue, "acceptanceRateFloor");
    if (
      newValue !== oldValue &&
      isWithinWeeklyLimit("acceptanceRateFloor", oldValue, newValue, recentChanges)
    ) {
      adjustments.push({
        threshold: "acceptanceRateFloor",
        oldValue,
        newValue,
        direction: "tighten",
        trigger: "effectiveness < 50%",
        evidence: `Agent success rate: ${effectiveness}%`,
      });
    }
  } else if (fpRate < 10 && effectiveness > 80) {
    const oldValue = currentThresholds.acceptanceRateFloor;
    let newValue = round(oldValue + 0.03);
    newValue = clamp(newValue, "acceptanceRateFloor");
    if (
      newValue !== oldValue &&
      isWithinWeeklyLimit("acceptanceRateFloor", oldValue, newValue, recentChanges)
    ) {
      adjustments.push({
        threshold: "acceptanceRateFloor",
        oldValue,
        newValue,
        direction: "tighten",
        trigger: "headroom (fp < 10% && effectiveness > 80%)",
        evidence: `FP rate: ${fpRate}%, effectiveness: ${effectiveness}%`,
      });
    }
  }

  return adjustments;
}

export function applyAdjustments(adjustments, configPath, changesPath) {
  if (adjustments.length === 0) return;

  const config = JSON.parse(readFileSync(configPath, "utf-8"));
  const today = new Date().toISOString().split("T")[0];

  for (const adj of adjustments) {
    config.thresholds[adj.threshold] = adj.newValue;

    mkdirSync(dirname(changesPath), { recursive: true });
    appendFileSync(
      changesPath,
      JSON.stringify({
        date: today,
        threshold: adj.threshold,
        oldValue: adj.oldValue,
        newValue: adj.newValue,
        trigger: adj.trigger,
        evidence: adj.evidence,
      }) + "\n"
    );
  }

  config.lastTunedAt = today;
  config.history = config.history ?? [];
  config.history.push({
    date: today,
    trigger: "threshold-auto-tuner",
    adjustments: adjustments.map(
      (a) => `${a.threshold}: ${a.oldValue} → ${a.newValue} (${a.direction}, ${a.trigger})`
    ),
    note: `Auto-tuned ${adjustments.length} threshold(s) from process metrics.`,
  });

  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

/* ── Main ────────────────────────────────────────────── */

function main() {
  const metrics = getLatestMetrics(METRICS_PATH);
  if (!metrics) {
    console.log("threshold-tuner: no process metrics available, skipping");
    return;
  }

  if (!existsSync(TUNING_PATH)) {
    console.log("threshold-tuner: no auto-qa-tuning.json found, skipping");
    return;
  }

  const config = JSON.parse(readFileSync(TUNING_PATH, "utf-8"));
  const recentChanges = loadThresholdHistory(CHANGES_PATH);
  const adjustments = computeAdjustments(metrics, config.thresholds, recentChanges);

  if (adjustments.length === 0) {
    console.log("threshold-tuner: metrics in normal range, no adjustments needed");
    return;
  }

  if (DRY_RUN) {
    console.log("threshold-tuner (dry-run): would apply:");
    for (const a of adjustments) {
      console.log(`  ${a.threshold}: ${a.oldValue} → ${a.newValue} (${a.direction})`);
    }
    return;
  }

  applyAdjustments(adjustments, TUNING_PATH, CHANGES_PATH);

  console.log(`threshold-tuner: applied ${adjustments.length} adjustment(s)`);
  for (const a of adjustments) {
    console.log(`  ${a.threshold}: ${a.oldValue} → ${a.newValue} (${a.direction}, ${a.trigger})`);
  }
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main();
}
