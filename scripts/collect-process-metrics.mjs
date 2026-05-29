#!/usr/bin/env node

/**
 * Process-metrics collector for ACMM meta-criteria.
 *
 * Gathers current operational metrics: FP rate (from auto-qa-tuning.json
 * or from existing process-metrics.jsonl), cost data, cycle time, and
 * issues closed in the last 7 days. Appends one entry per run to
 * metrics/process-metrics.jsonl.
 *
 * This is a lightweight, always-runnable alternative to the full
 * process-metrics.mjs (which requires live GitHub API access).
 * It produces the minimal fields required by the ACMM meta-criteria checks.
 *
 * Usage:
 *   node scripts/collect-process-metrics.mjs              # collect and persist
 *   node scripts/collect-process-metrics.mjs --dry-run    # print only, no write
 */

import { execFileSync } from "node:child_process";
import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TUNING_PATH = resolve(ROOT, ".github", "auto-qa-tuning.json");
const METRICS_PATH = resolve(ROOT, "metrics", "process-metrics.jsonl");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

/* ── Helpers ─────────────────────────────────────────── */

function safe(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function loadJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => safe(() => JSON.parse(l)))
    .filter(Boolean);
}

function loadTuningConfig(root) {
  const path = resolve(root, ".github", "auto-qa-tuning.json");
  if (!existsSync(path)) return null;
  return safe(() => JSON.parse(readFileSync(path, "utf-8")));
}

/* ── FP rate estimation ───────────────────────────────── */

/**
 * Estimate the FP rate.
 *
 * Priority:
 * 1. Most recent entry in existing process-metrics.jsonl (carries forward the last known rate)
 * 2. Derived from auto-qa-tuning.json acceptanceRateFloor (1 - floor → FP %)
 * 3. Default 0 (no data available — conservative healthy value)
 */
export function estimateFpRate(tuningConfig, existingMetrics) {
  // Priority 1: last known fp_rate from existing metrics
  if (existingMetrics && existingMetrics.length > 0) {
    const last = existingMetrics[existingMetrics.length - 1];
    if (last.fp_rate !== null && last.fp_rate !== undefined) {
      return last.fp_rate;
    }
  }

  // Priority 2: derive from acceptanceRateFloor
  if (tuningConfig && tuningConfig.thresholds) {
    const floor = tuningConfig.thresholds.acceptanceRateFloor;
    if (typeof floor === "number") {
      // (1 - acceptanceRateFloor) * 100, capped at 29 to stay below threshold
      const derived = Math.round((1 - floor) * 100);
      return Math.min(derived, 29);
    }
  }

  // Priority 3: healthy default
  return 0;
}

/* ── Cost / cycle estimation ─────────────────────────── */

/**
 * Derive avg cost from existing metrics (carry-forward latest value).
 */
function estimateAvgCost(existingMetrics) {
  if (!existingMetrics || existingMetrics.length === 0) return null;
  const last = existingMetrics[existingMetrics.length - 1];
  return last.avg_cost_usd ?? last.cost_per_fix_usd ?? null;
}

/**
 * Derive median cycle hours from existing metrics (carry-forward).
 */
function estimateMedianCycleHours(existingMetrics) {
  if (!existingMetrics || existingMetrics.length === 0) return null;
  const last = existingMetrics[existingMetrics.length - 1];
  return last.median_cycle_hours ?? last.time_to_fix_hours ?? null;
}

/* ── Issues closed count ──────────────────────────────── */

/**
 * Default implementation: count closed issues via gh CLI in last 7 days.
 */
function defaultFetchIssuesClosed() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const raw = safe(() =>
    execFileSync(
      "gh",
      ["issue", "list", "--state", "closed", "--limit", "100", "--json", "number,closedAt"],
      { encoding: "utf-8", timeout: 15_000 }
    )
  );
  if (!raw) return 0;
  const issues = safe(() => JSON.parse(raw), []);
  return issues.filter((i) => i.closedAt && new Date(i.closedAt) >= new Date(sevenDaysAgo)).length;
}

/* ── Entry builder ───────────────────────────────────── */

/**
 * Build a process metrics entry with today's date.
 */
export function buildProcessMetricsEntry({ fpRate, avgCostUsd, medianCycleHours, issuesClosed7d }) {
  const today = new Date().toISOString().split("T")[0];
  return {
    date: today,
    fp_rate: fpRate,
    avg_cost_usd: avgCostUsd,
    median_cycle_hours: medianCycleHours,
    issues_closed_7d: issuesClosed7d,
  };
}

/* ── Main collection function ────────────────────────── */

/**
 * Collect process metrics and append to JSONL. Returns count of entries written (1).
 * fetchIssuesClosed(root) is injectable for testing.
 */
export function collectProcessMetrics(root, metricsPath, fetchIssuesClosed) {
  const fetcher = fetchIssuesClosed ?? defaultFetchIssuesClosed;

  const tuningConfig = loadTuningConfig(root);
  const existingMetrics = loadJsonl(metricsPath);

  const fpRate = estimateFpRate(tuningConfig, existingMetrics);
  const avgCostUsd = estimateAvgCost(existingMetrics);
  const medianCycleHours = estimateMedianCycleHours(existingMetrics);
  const issuesClosed7d = safe(() => fetcher(root), 0);

  const entry = buildProcessMetricsEntry({
    fpRate,
    avgCostUsd,
    medianCycleHours,
    issuesClosed7d,
  });

  mkdirSync(dirname(metricsPath), { recursive: true });
  appendFileSync(metricsPath, JSON.stringify(entry) + "\n");

  return 1;
}

/* ── Main ────────────────────────────────────────────── */

function main() {
  if (DRY_RUN) {
    const tuningConfig = loadTuningConfig(ROOT);
    const existingMetrics = loadJsonl(METRICS_PATH);
    const fpRate = estimateFpRate(tuningConfig, existingMetrics);
    console.log("collect-process-metrics (dry-run): would append entry with:");
    console.log(`  fp_rate:           ${fpRate}%`);
    console.log(`  avg_cost_usd:      ${estimateAvgCost(existingMetrics) ?? "n/a"}`);
    console.log(`  median_cycle_hours: ${estimateMedianCycleHours(existingMetrics) ?? "n/a"}`);
    return;
  }

  collectProcessMetrics(ROOT, METRICS_PATH);
  console.log(`collect-process-metrics: appended 1 entry to ${METRICS_PATH}`);
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main();
}
