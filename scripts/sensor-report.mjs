#!/usr/bin/env node

/**
 * Unified sensor aggregation for the learning loop.
 *
 * Queries all available sensors, computes week-over-week deltas,
 * detects regressions, and writes a structured report.
 *
 * Usage:
 *   node scripts/sensor-report.mjs              # full report
 *   node scripts/sensor-report.mjs --dry-run    # print only, do not persist
 *   node scripts/sensor-report.mjs --json       # output raw JSON to stdout
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createGhClient } from "@mbe/gh-client";
import { collectAgentCost } from "./collect-agent-cost.mjs";
import { computeCodeChurn, CODE_CHURN_THRESHOLD } from "./collect-code-churn.mjs";
import { computePrCategoryMetrics } from "./collect-pr-metrics.mjs";
import { collectMutationScore } from "./collect-mutation-score.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const REPORT_PATH = resolve(ROOT, "metrics", "sensor-report.json");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const JSON_ONLY = args.includes("--json");

const THRESHOLDS = {
  lighthouse_score_drop: 0.05,
  ci_pass_rate_drop: 5,
  agent_success_rate_drop: 10,
  error_rate_increase: 20,
  service_uptime_min: 99.5,
  code_churn_rate_max: CODE_CHURN_THRESHOLD,
};

const now = new Date();
const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

const ghClient = createGhClient();

function safe(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

/* ── Sensor collectors ───────────────────────────────── */

function collectAcmm() {
  const statePath = resolve(ROOT, ".claude", "acmm", "state.json");
  const state = safe(() => readJson(statePath));
  if (!state) return { available: false };

  const checks = state.checks ?? {};
  const total = Object.keys(checks).length;
  const passed = Object.values(checks).filter((c) => c.passed).length;

  return {
    available: true,
    level: state.currentLevel ?? null,
    level_name: state.levelName ?? null,
    criteria_met: passed,
    criteria_total: total,
    last_run: state.lastRun ?? null,
  };
}

function collectPrMetrics() {
  const metricsPath = resolve(ROOT, "docs", "metrics", "pr-acceptance.json");
  const data = safe(() => readJson(metricsPath));
  if (!data) return { available: false };

  const entries = Array.isArray(data) ? data : (data.entries ?? []);
  const latest = entries[entries.length - 1];
  const previous = entries.length > 1 ? entries[entries.length - 2] : null;

  return {
    available: true,
    latest: latest ?? null,
    previous: previous ?? null,
    entry_count: entries.length,
  };
}

function collectPrCategoryMetricsSensor() {
  const raw = safe(
    () =>
      execFileSync(
        "gh",
        [
          "pr",
          "list",
          "--state",
          "all",
          "--limit",
          "100",
          "--json",
          "number,state,headRefName,mergedAt,closedAt,labels",
        ],
        { encoding: "utf-8", timeout: 15000 }
      ),
    null
  );
  if (!raw) return { available: false };
  const prs = safe(() => JSON.parse(raw), null);
  if (!prs) return { available: false };
  return computePrCategoryMetrics(prs);
}

function collectAgentCostSensor() {
  const spendPath = resolve(ROOT, ".claude", "agent-spend.jsonl");
  return collectAgentCost(spendPath, now);
}

/**
 * Parse `git log --numstat` output into commit objects.
 * Each commit block looks like:
 *   <hash> <iso-timestamp>
 *   <added>\t<deleted>\t<file>
 *   ...
 *   (blank line)
 *
 * Uses execFileSync with an arg array — no shell interpolation, no injection risk.
 */
function parseGitNumstat(root) {
  const raw = safe(
    () =>
      execFileSync(
        "git",
        ["-C", root, "log", "--numstat", "--format=%H %aI", "--no-merges", "--since=8 days ago"],
        { encoding: "utf-8", timeout: 10000 }
      ),
    null
  );
  if (!raw) return [];

  const commits = [];
  let current = null;

  for (const line of raw.split("\n")) {
    const headerMatch = line.match(/^([0-9a-f]{40})\s+(\S+)$/);
    if (headerMatch) {
      if (current) commits.push(current);
      current = { hash: headerMatch[1], timestamp: headerMatch[2], linesAdded: 0, linesDeleted: 0 };
      continue;
    }
    if (current && line.match(/^\d/)) {
      const parts = line.split("\t");
      const added = parseInt(parts[0], 10);
      const deleted = parseInt(parts[1], 10);
      if (!isNaN(added)) current = { ...current, linesAdded: current.linesAdded + added };
      if (!isNaN(deleted)) current = { ...current, linesDeleted: current.linesDeleted + deleted };
    }
  }
  if (current) commits.push(current);

  return commits;
}

function collectCodeChurnSensor() {
  const commits = parseGitNumstat(ROOT);
  return computeCodeChurn(commits, now);
}

function collectMutationScoreSensor() {
  const reportPath = resolve(ROOT, "reports", "mutation", "mutation.json");
  const reportJson = safe(() => readJson(reportPath));
  return collectMutationScore(reportJson, now);
}

function collectCiHealth() {
  const runs = safe(
    () => ghClient.workflow.runs(["--limit", "30", "--json", "status,conclusion,createdAt,name"]),
    null
  );
  if (!runs) return { available: false };
  if (runs.length === 0) return { available: false };

  const completed = runs.filter((r) => r.status === "completed");
  const passed = completed.filter((r) => r.conclusion === "success");
  const failed = completed.filter((r) => r.conclusion === "failure");
  const passRate =
    completed.length > 0 ? Math.round((passed.length / completed.length) * 100) : 100;

  return {
    available: true,
    total_runs: runs.length,
    completed: completed.length,
    passed: passed.length,
    failed: failed.length,
    pass_rate_pct: passRate,
    most_recent: runs[0] ?? null,
  };
}

function collectLighthouse() {
  const invPath = resolve(ROOT, ".audit-state", "inventory.json");
  const inv = safe(() => readJson(invPath));
  if (!inv) return { available: false };

  const surfaces = inv.surfaces ?? inv;
  if (!Array.isArray(surfaces) && typeof surfaces !== "object") return { available: false };

  const entries = Array.isArray(surfaces) ? surfaces : Object.values(surfaces);
  const scored = entries.filter((s) => s.scores || s.lighthouse);

  return {
    available: true,
    surface_count: entries.length,
    scored_count: scored.length,
    surfaces: scored.map((s) => ({
      url: s.url ?? s.name ?? "unknown",
      scores: s.scores ?? s.lighthouse ?? {},
      last_audit: s.lastAudit ?? s.last_audit ?? null,
    })),
  };
}

function collectGitHubIssues() {
  const issues = safe(
    () =>
      ghClient.issue.list([
        "--state",
        "all",
        "--limit",
        "50",
        "--json",
        "number,state,labels,createdAt,closedAt",
      ]),
    null
  );
  if (!issues) return { available: false };
  const recentIssues = issues.filter((i) => new Date(i.createdAt) >= sevenDaysAgo);
  const recentClosed = issues.filter((i) => i.closedAt && new Date(i.closedAt) >= sevenDaysAgo);
  const openReady = issues.filter(
    (i) => i.state === "OPEN" && (i.labels ?? []).some((l) => l.name === "ready")
  );
  const agentFailed = issues.filter(
    (i) => i.state === "OPEN" && (i.labels ?? []).some((l) => l.name === "agent-failed")
  );

  return {
    available: true,
    created_7d: recentIssues.length,
    closed_7d: recentClosed.length,
    closure_rate:
      recentIssues.length > 0 ? Math.round((recentClosed.length / recentIssues.length) * 100) : 100,
    queue_depth: openReady.length,
    agent_failed: agentFailed.length,
  };
}

function collectIssueFeedback() {
  const feedbackPath = resolve(ROOT, "metrics", "ai-issue-feedback.json");
  const data = safe(() => readJson(feedbackPath));
  if (!data || !data.categories) return { available: false };

  const categories = data.categories;
  const unhealthy = Object.entries(categories)
    .filter(([, stats]) => stats.rejection_rate > 0.4)
    .map(([cat]) => cat);

  return {
    available: true,
    collected_at: data.collected_at ?? null,
    category_count: Object.keys(categories).length,
    unhealthy_categories: unhealthy,
    categories,
    budgets: data.budgets ?? {},
  };
}

function collectSessionLogs() {
  const logDir = resolve(ROOT, ".claude", "session-logs");
  if (!existsSync(logDir)) return { available: false };

  const files = safe(
    () => readdirSync(logDir).filter((f) => f.endsWith(".json") && f !== ".gitkeep"),
    []
  );
  const recentFiles = files.filter((f) => {
    const fstat = safe(() => statSync(join(logDir, f)));
    return fstat && fstat.mtime >= sevenDaysAgo;
  });

  const sessions = recentFiles.map((f) => safe(() => readJson(join(logDir, f)))).filter(Boolean);

  const totalCommits = sessions.reduce((sum, s) => sum + (s.commit_count ?? 0), 0);
  const branches = [...new Set(sessions.map((s) => s.branch).filter(Boolean))];

  return {
    available: true,
    total_logs: files.length,
    logs_7d: recentFiles.length,
    total_commits_7d: totalCommits,
    unique_branches_7d: branches.length,
    branches_7d: branches,
  };
}

/* ── Regression detection ────────────────────────────── */

function detectRegressions(current, previous) {
  const regressions = [];

  if (current.ciHealth?.available && previous?.ciHealth?.available) {
    const delta = current.ciHealth.pass_rate_pct - previous.ciHealth.pass_rate_pct;
    if (delta < -THRESHOLDS.ci_pass_rate_drop) {
      regressions.push({
        sensor: "ciHealth",
        metric: "pass_rate_pct",
        current: current.ciHealth.pass_rate_pct,
        previous: previous.ciHealth.pass_rate_pct,
        delta,
        severity: "high",
      });
    }
  }

  if (current.lighthouse?.available && previous?.lighthouse?.available) {
    for (const surface of current.lighthouse.surfaces ?? []) {
      const prevSurface = (previous.lighthouse.surfaces ?? []).find((s) => s.url === surface.url);
      if (!prevSurface) continue;

      for (const [category, score] of Object.entries(surface.scores)) {
        const prevScore = prevSurface.scores?.[category];
        if (prevScore == null) continue;
        const delta = score - prevScore;
        if (delta < -THRESHOLDS.lighthouse_score_drop) {
          regressions.push({
            sensor: "lighthouse",
            metric: `${surface.url}:${category}`,
            current: score,
            previous: prevScore,
            delta: Math.round(delta * 100) / 100,
            severity: delta < -0.1 ? "high" : "medium",
          });
        }
      }
    }
  }

  if (current.issues?.available && previous?.issues?.available) {
    if (current.issues.closure_rate < 50 && previous.issues.closure_rate >= 50) {
      regressions.push({
        sensor: "issues",
        metric: "closure_rate",
        current: current.issues.closure_rate,
        previous: previous.issues.closure_rate,
        delta: current.issues.closure_rate - previous.issues.closure_rate,
        severity: "medium",
      });
    }
  }

  if (current.codeChurn?.available) {
    if (current.codeChurn.churn_rate > THRESHOLDS.code_churn_rate_max) {
      regressions.push({
        sensor: "codeChurn",
        metric: "churn_rate",
        current: current.codeChurn.churn_rate,
        previous: previous?.codeChurn?.churn_rate ?? null,
        delta:
          previous?.codeChurn?.churn_rate != null
            ? Math.round((current.codeChurn.churn_rate - previous.codeChurn.churn_rate) * 1000) /
              1000
            : null,
        severity: current.codeChurn.churn_rate > 0.5 ? "high" : "medium",
      });
    }
  }

  return regressions;
}

/* ── Main ────────────────────────────────────────────── */

const report = {
  generated_at: now.toISOString(),
  period: {
    start: sevenDaysAgo.toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10),
  },
  sensors: {
    acmm: collectAcmm(),
    prMetrics: collectPrMetrics(),
    prCategoryMetrics: collectPrCategoryMetricsSensor(),
    agentCost: collectAgentCostSensor(),
    ciHealth: collectCiHealth(),
    lighthouse: collectLighthouse(),
    issues: collectGitHubIssues(),
    issueFeedback: collectIssueFeedback(),
    sessionLogs: collectSessionLogs(),
    codeChurn: collectCodeChurnSensor(),
    mutationScore: collectMutationScoreSensor(),
  },
  thresholds: THRESHOLDS,
  regressions: [],
};

const previousReport = safe(() => readJson(REPORT_PATH));
report.regressions = detectRegressions(report.sensors, previousReport?.sensors);

const availableCount = Object.values(report.sensors).filter((s) => s.available).length;
const totalSensors = Object.keys(report.sensors).length;
const regressedCount = report.regressions.length;

report.summary = {
  sensors_available: availableCount,
  sensors_total: totalSensors,
  regressions_detected: regressedCount,
  status: regressedCount > 0 ? "regressions_detected" : "healthy",
};

if (JSON_ONLY) {
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} else {
  console.log(`\n📊 Sensor Report — ${report.period.start} to ${report.period.end}`);
  console.log(`   Sensors: ${availableCount}/${totalSensors} available`);
  console.log(
    `   Status:  ${regressedCount > 0 ? `⚠️  ${regressedCount} regression(s)` : "✅ Healthy"}`
  );
  console.log();

  for (const [name, data] of Object.entries(report.sensors)) {
    if (!data.available) {
      console.log(`   ${name}: ⏭  not available`);
      continue;
    }

    switch (name) {
      case "acmm":
        console.log(
          `   ${name}: L${data.level} (${data.criteria_met}/${data.criteria_total} criteria)`
        );
        break;
      case "ciHealth":
        console.log(
          `   ${name}: ${data.pass_rate_pct}% pass rate (${data.passed}/${data.completed})`
        );
        break;
      case "agentCost":
        console.log(
          `   ${name}: $${data.spend_7d_usd} (7d), $${data.spend_today_usd} (today), ${data.sessions_7d} sessions`
        );
        break;
      case "issues":
        console.log(
          `   ${name}: ${data.created_7d} created, ${data.closed_7d} closed, ${data.queue_depth} ready`
        );
        break;
      case "sessionLogs":
        console.log(`   ${name}: ${data.logs_7d} sessions (7d), ${data.total_commits_7d} commits`);
        break;
      case "lighthouse":
        console.log(`   ${name}: ${data.scored_count} surfaces scored`);
        break;
      case "prMetrics":
        console.log(`   ${name}: ${data.entry_count} entries`);
        break;
      case "prCategoryMetrics": {
        const categoryList = Object.keys(data.by_category ?? {}).join(", ") || "none";
        const noteStr = data.signal_note ? " [signal uninformative: fix-forward pattern]" : "";
        console.log(
          `   ${name}: ${data.total_merged}/${data.total_prs} merged by category (${categoryList})${noteStr}`
        );
        break;
      }
      case "issueFeedback":
        console.log(
          `   ${name}: ${data.category_count} categories, ${data.unhealthy_categories.length} unhealthy (>${Math.round(0.4 * 100)}% rejected)`
        );
        break;
      case "codeChurn":
        console.log(
          `   ${name}: ${Math.round(data.churn_rate * 100)}% churn rate (${data.lines_churned_7d} deleted / ${data.total_lines_added_7d} added, 7d)`
        );
        break;
      case "mutationScore":
        console.log(
          `   ${name}: ${data.mutation_score}% (${data.killed}/${data.total_mutants} killed, threshold ${data.threshold}%) ${data.passes_threshold ? "PASS" : "BELOW TARGET"}`
        );
        break;
      default:
        console.log(`   ${name}: available`);
    }
  }

  if (regressedCount > 0) {
    console.log("\n   Regressions:");
    for (const r of report.regressions) {
      console.log(
        `   ⚠️  ${r.sensor}.${r.metric}: ${r.previous} → ${r.current} (${r.delta > 0 ? "+" : ""}${r.delta}) [${r.severity}]`
      );
    }
  }

  console.log();
}

if (!DRY_RUN) {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");
  if (!JSON_ONLY) console.log(`   Written to: ${REPORT_PATH}\n`);
}

process.exit(regressedCount > 0 ? 1 : 0);
