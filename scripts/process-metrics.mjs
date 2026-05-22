#!/usr/bin/env node

/**
 * Process metrics collector for the improvement flywheel.
 *
 * Tracks time-to-fix, cost, success rate, FP rate, and improvements shipped.
 * Called by the learning-loop skill after sensor collection and before issue creation.
 *
 * Usage:
 *   node scripts/process-metrics.mjs              # collect and persist
 *   node scripts/process-metrics.mjs --dry-run    # print only, do not persist
 *   node scripts/process-metrics.mjs --json       # output raw JSON to stdout
 *
 * Output:
 *   metrics/process-metrics.jsonl          — one JSON line per collection run
 *   metrics/process-metrics-weekly.json    — weekly aggregation with rolling 4-week trend
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const METRICS_DIR = resolve(ROOT, "metrics");
const JSONL_PATH = resolve(METRICS_DIR, "process-metrics.jsonl");
const WEEKLY_PATH = resolve(METRICS_DIR, "process-metrics-weekly.json");
const VERIFICATIONS_PATH = resolve(ROOT, ".claude", "improvement-loop", "verifications.jsonl");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const JSON_ONLY = args.includes("--json");

/* ── Helpers ─────────────────────────────────────────── */

function safe(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function gh(...ghArgs) {
  return execFileSync("gh", ghArgs, {
    encoding: "utf-8",
    timeout: 15_000,
  }).trim();
}

export function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => safe(() => JSON.parse(l)))
    .filter(Boolean);
}

/* ── Metric computation (pure functions) ─────────────── */

/**
 * Average hours from issue creation to close for has-pr labeled issues.
 */
export function computeTimeToFix(issues) {
  const hasPrIssues = issues.filter((i) => (i.labels ?? []).some((l) => l.name === "has-pr"));

  if (hasPrIssues.length === 0) return 0;

  const totalHours = hasPrIssues.reduce((sum, issue) => {
    const created = new Date(issue.createdAt);
    const closed = new Date(issue.closedAt);
    const hours = (closed - created) / (1000 * 60 * 60);
    return sum + hours;
  }, 0);

  return Math.round((totalHours / hasPrIssues.length) * 100) / 100;
}

/**
 * Extract dollar amount from comment body matching budget patterns.
 */
export function extractBudgetFromComments(comments) {
  for (const comment of comments) {
    const match = (comment.body ?? "").match(/(?:budget used|cost):\s*\$(\d+(?:\.\d+)?)/i);
    if (match) {
      return parseFloat(match[1]);
    }
  }
  return null;
}

/**
 * Average cost per fix from issue comments containing budget metadata.
 */
export function computeCostPerFix(issueComments) {
  if (issueComments.length === 0) return null;

  const costs = issueComments
    .map((ic) => extractBudgetFromComments(ic.comments))
    .filter((c) => c !== null);

  if (costs.length === 0) return null;

  return costs.reduce((sum, c) => sum + c, 0) / costs.length;
}

/**
 * Success rate: has-pr / (has-pr + agent-failed) as percentage.
 */
export function computeAgentSuccessRate(issues) {
  const hasPr = issues.filter((i) => (i.labels ?? []).some((l) => l.name === "has-pr")).length;

  const agentFailed = issues.filter((i) =>
    (i.labels ?? []).some((l) => l.name === "agent-failed")
  ).length;

  const total = hasPr + agentFailed;
  if (total === 0) return 100;

  return Math.round((hasPr / total) * 100);
}

/**
 * False positive rate from verifications log: unverified / total.
 */
export function computeFpRate(verifications) {
  if (!verifications || verifications.length === 0) return null;

  const falsePositives = verifications.filter((v) => !v.verified).length;
  return Math.round((falsePositives / verifications.length) * 100);
}

/**
 * Count closed issues with improvement label.
 */
export function computeImprovementsShipped(issues) {
  return issues.filter(
    (i) => i.state === "CLOSED" && (i.labels ?? []).some((l) => l.name === "improvement")
  ).length;
}

/* ── Orchestration ───────────────────────────────────── */

/**
 * Assemble all metrics from pre-fetched data.
 */
export function collectProcessMetrics({ closedIssues, issueComments, allIssues, verifications }) {
  return {
    timestamp: new Date().toISOString(),
    time_to_fix_hours: computeTimeToFix(closedIssues),
    cost_per_fix_usd: computeCostPerFix(issueComments),
    agent_success_rate: computeAgentSuccessRate(allIssues),
    fp_rate: computeFpRate(verifications),
    improvements_shipped: computeImprovementsShipped(closedIssues),
  };
}

/* ── File I/O ────────────────────────────────────────── */

export function appendMetricLine(filePath, entry) {
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, JSON.stringify(entry) + "\n");
}

export function writeWeeklySummary(filePath, summary) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(summary, null, 2) + "\n");
}

/**
 * Generate weekly summary with rolling 4-week trend.
 */
export function generateWeeklySummary(entries) {
  if (entries.length === 0) {
    return {
      generated_at: new Date().toISOString(),
      latest: null,
      rolling_4_week: null,
      trend: null,
    };
  }

  const sorted = [...entries].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const latest = sorted[sorted.length - 1];
  const rolling = sorted.slice(-4);

  const avg = (arr, key) => {
    const vals = arr.map((e) => e[key]).filter((v) => v !== null && v !== undefined);
    if (vals.length === 0) return null;
    return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100;
  };

  const rolling4Week = {
    avg_time_to_fix_hours: avg(rolling, "time_to_fix_hours"),
    avg_cost_per_fix_usd: avg(rolling, "cost_per_fix_usd"),
    avg_agent_success_rate: avg(rolling, "agent_success_rate"),
    avg_fp_rate: avg(rolling, "fp_rate"),
    total_improvements_shipped: rolling.reduce((s, e) => s + (e.improvements_shipped ?? 0), 0),
    weeks_included: rolling.length,
  };

  // Trend: compare latest to first entry in rolling window
  let trend;
  if (rolling.length < 2) {
    trend = { direction: "stable", detail: "insufficient data for trend" };
  } else {
    const oldest = rolling[0];
    const successDelta = (latest.agent_success_rate ?? 0) - (oldest.agent_success_rate ?? 0);
    const fixTimeDelta = (latest.time_to_fix_hours ?? 0) - (oldest.time_to_fix_hours ?? 0);

    if (successDelta > 5 || fixTimeDelta < -1) {
      trend = {
        direction: "improving",
        success_rate_delta: successDelta,
        fix_time_delta: Math.round(fixTimeDelta * 100) / 100,
      };
    } else if (successDelta < -5 || fixTimeDelta > 2) {
      trend = {
        direction: "degrading",
        success_rate_delta: successDelta,
        fix_time_delta: Math.round(fixTimeDelta * 100) / 100,
      };
    } else {
      trend = {
        direction: "stable",
        success_rate_delta: successDelta,
        fix_time_delta: Math.round(fixTimeDelta * 100) / 100,
      };
    }
  }

  return {
    generated_at: new Date().toISOString(),
    latest,
    rolling_4_week: rolling4Week,
    trend,
  };
}

/* ── Data fetching (gh CLI) ──────────────────────────── */

function fetchClosedIssues() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const raw = safe(() =>
    gh(
      "issue",
      "list",
      "--state",
      "closed",
      "--label",
      "has-pr",
      "--limit",
      "50",
      "--json",
      "number,createdAt,closedAt,labels,state"
    )
  );
  if (!raw) return [];

  const issues = safe(() => JSON.parse(raw), []);
  return issues.filter((i) => i.closedAt && new Date(i.closedAt) >= sevenDaysAgo);
}

function fetchAllRecentIssues() {
  const raw = safe(() =>
    gh(
      "issue",
      "list",
      "--state",
      "all",
      "--limit",
      "100",
      "--json",
      "number,labels,state,createdAt,closedAt"
    )
  );
  if (!raw) return [];
  return safe(() => JSON.parse(raw), []);
}

function fetchIssueComments(issueNumbers) {
  return issueNumbers.map((num) => {
    const raw = safe(() =>
      gh("issue", "view", String(num), "--json", "comments", "--jq", ".comments")
    );
    const comments = safe(() => JSON.parse(raw), []);
    return { issueNumber: num, comments: comments ?? [] };
  });
}

function loadVerifications() {
  if (!existsSync(VERIFICATIONS_PATH)) return null;
  const entries = readJsonl(VERIFICATIONS_PATH);
  if (entries.length === 0) return null;

  // Only last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recent = entries.filter((e) => e.timestamp && new Date(e.timestamp) >= sevenDaysAgo);
  return recent.length > 0 ? recent : null;
}

/* ── Main ────────────────────────────────────────────── */

function main() {
  const closedIssues = fetchClosedIssues();
  const allIssues = fetchAllRecentIssues();
  const issueNumbers = closedIssues.map((i) => i.number);
  const issueComments = fetchIssueComments(issueNumbers);
  const verifications = loadVerifications();

  const metrics = collectProcessMetrics({
    closedIssues,
    issueComments,
    allIssues,
    verifications,
  });

  if (JSON_ONLY) {
    process.stdout.write(JSON.stringify(metrics, null, 2) + "\n");
  } else {
    console.log("\n-- Process Metrics --");
    console.log(`   Time to fix: ${metrics.time_to_fix_hours}h avg`);
    console.log(
      `   Cost/fix:    ${metrics.cost_per_fix_usd !== null ? "$" + metrics.cost_per_fix_usd : "n/a"}`
    );
    console.log(`   Success rate: ${metrics.agent_success_rate}%`);
    console.log(`   FP rate:     ${metrics.fp_rate !== null ? metrics.fp_rate + "%" : "n/a"}`);
    console.log(`   Shipped:     ${metrics.improvements_shipped} improvements`);
    console.log();
  }

  if (!DRY_RUN) {
    appendMetricLine(JSONL_PATH, metrics);

    // Regenerate weekly summary
    const allEntries = readJsonl(JSONL_PATH);
    const summary = generateWeeklySummary(allEntries);
    writeWeeklySummary(WEEKLY_PATH, summary);

    if (!JSON_ONLY) {
      console.log(`   Appended to: ${JSONL_PATH}`);
      console.log(`   Weekly:      ${WEEKLY_PATH}\n`);
    }
  }
}

// Run main only when executed directly (not imported for testing)
const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main();
}
