/**
 * Pure collector for queue-efficiency scorecard.
 *
 * Reconstructs a composite efficiency metric from GitHub PR history + ccusage
 * spend — no changes to the agent hot path. Works on day 1 with an instant
 * rolling-7-day-median baseline because weeks of PR history already exist.
 *
 * Composite weights: first-pass-success 0.4 / cost 0.4 / time-to-merge 0.2
 *
 * Dependency injection (readPrs / readCcusage) keeps the function unit-testable
 * without live network calls. Both default to real CLI calls.
 *
 * Output shape:
 *   { available, composite, sub_metrics, distribution, baseline, regressions[] }
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Thresholds — imported by sensor-report.mjs for its THRESHOLDS block. */
export const QUEUE_EFFICIENCY_COMPOSITE_DROP = 0.05;
export const QUEUE_EFFICIENCY_FPS_DROP = 0.1;

/** Worktree branch patterns used by implement-queue agents. */
const WORKER_BRANCH_RE = /^worktree-agent-/;

/**
 * An AI/worker PR is identified by:
 *   - `agent-authored` label (current convention), OR
 *   - `has-pr` label (legacy coordination label), OR
 *   - a `worktree-agent-*` branch name (matches implement-queue worktree pattern).
 *
 * @param {{ headRefName?: string, labels?: Array<{ name: string }> }} pr
 * @returns {boolean}
 */
function isAiPr(pr) {
  const labels = pr.labels ?? [];
  if (labels.some((l) => l.name === "agent-authored")) return true;
  if (labels.some((l) => l.name === "has-pr")) return true;
  return WORKER_BRANCH_RE.test(pr.headRefName ?? "");
}

/**
 * Median of a numeric array. Returns null for empty input.
 *
 * @param {number[]} values
 * @returns {number|null}
 */
function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Difficulty tier from a `size:` label (preferred) or total diff size.
 *
 * @param {{ labels?: Array<{ name: string }>, additions?: number, deletions?: number }} pr
 * @returns {string}
 */
function sizeTier(pr) {
  const sizeLabel = (pr.labels ?? []).find((l) => l.name.startsWith("size:"));
  if (sizeLabel) return sizeLabel.name;
  const diff = (pr.additions ?? 0) + (pr.deletions ?? 0);
  if (diff < 50) return "size:xs";
  if (diff < 200) return "size:s";
  if (diff < 500) return "size:m";
  if (diff < 1000) return "size:l";
  return "size:xl";
}

// ── Score functions — higher is always better (0–1) ──────────────────────

/** @param {number} rate - Already 0-1. */
function scoreFirstPass(rate) {
  return rate;
}

/** @param {number} costPerIssue - USD per merged issue. $1 = excellent, $5 = poor. */
function scoreCost(costPerIssue) {
  return Math.max(0, Math.min(1, 1 - (costPerIssue - 1) / 4));
}

/** @param {number} ttmHours - Time-to-merge in hours. 12h = excellent, 72h = poor. */
function scoreTtm(ttmHours) {
  return Math.max(0, Math.min(1, 1 - (ttmHours - 12) / 60));
}

/**
 * Weighted composite from the three normalised sub-scores.
 *
 * @param {number} fps - first-pass-success score
 * @param {number} cost - cost score
 * @param {number} ttm - time-to-merge score
 * @returns {number}
 */
function computeComposite(fps, cost, ttm) {
  return Math.round((0.4 * fps + 0.4 * cost + 0.2 * ttm) * 1000) / 1000;
}

/**
 * Compute sub-metrics for a set of merged AI PRs and their cost window.
 *
 * Cost preference (in order):
 *   1. Precise per-issue cost from telemetry rows when ALL window PRs have
 *      a matching row with a numeric `cost_usd` field.
 *   2. ccusage daily total ÷ issues (existing behaviour) — used when
 *      telemetry coverage is incomplete, absent, or missing `cost_usd`.
 *
 * @param {Array<object>} windowPrs
 * @param {Array<{ totalCost?: number }>} ccusageDays
 * @param {Array<{ pr_number?: number, cost_usd?: number }>} [telemetryRows]
 * @returns {object}
 */
function computeWindowMetrics(windowPrs, ccusageDays, telemetryRows = []) {
  const firstPassCount = windowPrs.filter((pr) => (pr.commitCount ?? 1) <= 2).length;
  const firstPassRate = Math.round((firstPassCount / windowPrs.length) * 1000) / 1000;

  const commitCounts = windowPrs.map((pr) => pr.commitCount ?? 1);
  const ttmHoursList = windowPrs
    .map((pr) => {
      if (!pr.createdAt || !pr.mergedAt) return null;
      return (new Date(pr.mergedAt) - new Date(pr.createdAt)) / (1000 * 60 * 60);
    })
    .filter((h) => h !== null);

  const medianTtmHours = median(ttmHoursList) ?? 24;
  const medianReworkCycles = median(commitCounts.map((c) => Math.max(0, c - 1))) ?? 0;

  // Prefer precise per-issue telemetry cost when every window PR is covered.
  const prNumbers = new Set(windowPrs.map((pr) => pr.number));
  const matchedCosts = (telemetryRows ?? [])
    .filter((r) => prNumbers.has(r.pr_number) && typeof r.cost_usd === "number")
    .map((r) => r.cost_usd);

  const totalCost =
    matchedCosts.length === windowPrs.length
      ? matchedCosts.reduce((sum, c) => sum + c, 0)
      : (ccusageDays ?? []).reduce((sum, d) => sum + (d.totalCost ?? 0), 0);

  const costPerIssue = totalCost / windowPrs.length;

  return {
    issues_merged: windowPrs.length,
    first_pass_success_rate: firstPassRate,
    median_time_to_merge_hours: Math.round(medianTtmHours * 10) / 10,
    median_rework_cycles: Math.round(medianReworkCycles * 10) / 10,
    cost_per_issue_usd: Math.round(costPerIssue * 1000) / 1000,
  };
}

/**
 * Default PR reader — calls `gh pr list` and normalises the commits array to a count.
 *
 * @returns {Array<object>|null}
 */
function defaultReadPrs() {
  try {
    // Limit to 45 PRs: GitHub's GraphQL caps nodes at 500k; the commits sub-field
    // multiplies PRs × ~11k potential nodes per PR. 45 sits safely under that ceiling.
    // For repos with ≥5 AI PRs/day this covers ~9 days of history — enough for the
    // 7-day current window plus partial prior-week baseline.
    const raw = execFileSync(
      "gh",
      [
        "pr",
        "list",
        "--state",
        "all",
        "--limit",
        "45",
        "--json",
        "number,state,headRefName,createdAt,mergedAt,closedAt,labels,commits,additions,deletions",
      ],
      { encoding: "utf-8", timeout: 15000 }
    );
    return JSON.parse(raw).map((pr) => ({
      ...pr,
      commitCount: Array.isArray(pr.commits) ? pr.commits.length : (pr.commitCount ?? 1),
    }));
  } catch {
    return null;
  }
}

/**
 * Default ccusage reader — same shape as collect-ccusage.mjs.
 *
 * @returns {{ daily: Array<{ period: string, totalCost: number }> }|null}
 */
function defaultReadCcusage() {
  try {
    const raw = execFileSync("npx", ["-y", "ccusage@latest", "daily", "--json", "--no-cost"], {
      encoding: "utf-8",
      timeout: 30000,
    });
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Default telemetry reader — reads metrics/queue-telemetry.jsonl.
 *
 * @returns {Array<object>|null}
 */
function defaultReadTelemetry() {
  try {
    const filePath = join(
      fileURLToPath(import.meta.url),
      "..",
      "..",
      "metrics",
      "queue-telemetry.jsonl"
    );
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, "utf-8");
    return content
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
    return null;
  }
}

/**
 * Collect the queue-efficiency scorecard.
 *
 * @param {() => Array<object>|null} [readPrs] - Injected PR reader.
 * @param {() => { daily: Array<object> }|null} [readCcusage] - Injected ccusage reader.
 * @param {Date} [now] - Reference time (injectable for tests).
 * @param {() => Array<object>|null} [readTelemetry] - Injected telemetry reader.
 *   When provided rows cover all current-window PRs with `cost_usd`, the
 *   per-issue precise cost is preferred over the ccusage daily estimate.
 * @returns {{
 *   available: boolean,
 *   composite?: number,
 *   sub_metrics?: object,
 *   distribution?: object,
 *   baseline?: object|null,
 *   regressions?: Array<object>,
 * }}
 */
export function collectQueueEfficiency(
  readPrs = defaultReadPrs,
  readCcusage = defaultReadCcusage,
  now = new Date(),
  readTelemetry = defaultReadTelemetry
) {
  let prs;
  try {
    prs = readPrs();
  } catch {
    return { available: false };
  }
  if (!Array.isArray(prs) || prs.length === 0) return { available: false };

  let ccusageData;
  try {
    ccusageData = readCcusage();
  } catch {
    ccusageData = null;
  }

  let telemetryRows;
  try {
    telemetryRows = readTelemetry() ?? [];
  } catch {
    telemetryRows = [];
  }

  const sevenDaysAgo = new Date(+now - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(+now - 30 * 24 * 60 * 60 * 1000);
  const dailyEntries = Array.isArray(ccusageData?.daily) ? ccusageData.daily : [];

  // Only merged AI PRs within the last 30 days form our analysis pool.
  const mergedAiPrs = prs.filter((pr) => {
    if (!isAiPr(pr)) return false;
    if (!pr.mergedAt) return false;
    const d = new Date(pr.mergedAt);
    return !isNaN(d) && d >= thirtyDaysAgo;
  });

  if (mergedAiPrs.length === 0) return { available: false };

  const currentPrs = mergedAiPrs.filter((pr) => new Date(pr.mergedAt) >= sevenDaysAgo);
  if (currentPrs.length === 0) return { available: false };

  const currentCcusageDays = dailyEntries.filter((d) => new Date(d.period) >= sevenDaysAgo);
  // Pass telemetry rows for precise per-issue cost preference (falls back to ccusage).
  const currentMetrics = computeWindowMetrics(currentPrs, currentCcusageDays, telemetryRows);

  // Rolling baseline from the 3 prior weekly windows (days 8–28).
  const weekMetrics = [];
  for (let w = 1; w <= 3; w++) {
    const weekStart = new Date(+now - (w + 1) * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(+now - w * 7 * 24 * 60 * 60 * 1000);
    const weekPrs = mergedAiPrs.filter((pr) => {
      const d = new Date(pr.mergedAt);
      return d >= weekStart && d < weekEnd;
    });
    if (weekPrs.length === 0) continue;
    const weekCcusageDays = dailyEntries.filter((d) => {
      const day = new Date(d.period);
      return day >= weekStart && day < weekEnd;
    });
    weekMetrics.push(computeWindowMetrics(weekPrs, weekCcusageDays));
  }

  const fpScore = scoreFirstPass(currentMetrics.first_pass_success_rate);
  const costScore = scoreCost(currentMetrics.cost_per_issue_usd);
  const ttmScore = scoreTtm(currentMetrics.median_time_to_merge_hours);
  const compositeScore = computeComposite(fpScore, costScore, ttmScore);

  const baseline =
    weekMetrics.length === 0
      ? null
      : {
          composite_median: median(
            weekMetrics.map((m) =>
              computeComposite(
                scoreFirstPass(m.first_pass_success_rate),
                scoreCost(m.cost_per_issue_usd),
                scoreTtm(m.median_time_to_merge_hours)
              )
            )
          ),
          weeks_sampled: weekMetrics.length,
          fps_median: median(weekMetrics.map((m) => m.first_pass_success_rate)),
          ttm_median: median(weekMetrics.map((m) => m.median_time_to_merge_hours)),
          cost_per_issue_median: median(weekMetrics.map((m) => m.cost_per_issue_usd)),
        };

  const regressions = [];
  if (baseline?.composite_median != null) {
    const delta = compositeScore - baseline.composite_median;
    if (delta < -QUEUE_EFFICIENCY_COMPOSITE_DROP) {
      regressions.push({
        sensor: "queueEfficiency",
        metric: "composite",
        current: compositeScore,
        baseline: baseline.composite_median,
        delta: Math.round(delta * 1000) / 1000,
        severity: delta < -0.15 ? "high" : "medium",
      });
    }
  }
  if (baseline?.fps_median != null) {
    const fpsDelta = currentMetrics.first_pass_success_rate - baseline.fps_median;
    if (fpsDelta < -QUEUE_EFFICIENCY_FPS_DROP) {
      regressions.push({
        sensor: "queueEfficiency",
        metric: "first_pass_success_rate",
        current: currentMetrics.first_pass_success_rate,
        baseline: baseline.fps_median,
        delta: Math.round(fpsDelta * 1000) / 1000,
        severity: fpsDelta < -0.2 ? "high" : "medium",
      });
    }
  }

  // Distribution by difficulty tier — Goodhart guard.
  const distAccum = {};
  for (const pr of currentPrs) {
    const tier = sizeTier(pr);
    const ttmH =
      pr.createdAt && pr.mergedAt
        ? (new Date(pr.mergedAt) - new Date(pr.createdAt)) / (1000 * 60 * 60)
        : 0;
    const prev = distAccum[tier] ?? { count: 0, total_commits: 0, total_ttm_hours: 0 };
    distAccum[tier] = {
      count: prev.count + 1,
      total_commits: prev.total_commits + (pr.commitCount ?? 1),
      total_ttm_hours: prev.total_ttm_hours + ttmH,
    };
  }

  const distribution = Object.fromEntries(
    Object.entries(distAccum).map(([tier, acc]) => [
      tier,
      {
        count: acc.count,
        avg_commits: Math.round((acc.total_commits / acc.count) * 10) / 10,
        avg_ttm_hours: Math.round((acc.total_ttm_hours / acc.count) * 10) / 10,
      },
    ])
  );

  return {
    available: true,
    composite: compositeScore,
    sub_metrics: currentMetrics,
    distribution,
    baseline,
    regressions,
  };
}
