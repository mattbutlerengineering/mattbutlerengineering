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
import { createGhClient } from "@mbe/gh-client";

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

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => safe(() => JSON.parse(l)))
    .filter(Boolean);
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

function collectAgentCost() {
  const spendPath = resolve(ROOT, ".claude", "agent-spend.jsonl");
  const entries = readJsonl(spendPath);
  if (entries.length === 0) return { available: false };

  const sevenDayEntries = entries.filter((e) => new Date(e.date || e.timestamp) >= sevenDaysAgo);
  const totalSpend7d = sevenDayEntries.reduce((sum, e) => sum + (e.costUsd ?? e.cost_usd ?? 0), 0);
  const todayStr = now.toISOString().slice(0, 10);
  const todayEntries = entries.filter((e) => (e.date || e.timestamp || "").startsWith(todayStr));
  const todaySpend = todayEntries.reduce((sum, e) => sum + (e.costUsd ?? e.cost_usd ?? 0), 0);

  return {
    available: true,
    spend_today_usd: Math.round(todaySpend * 100) / 100,
    spend_7d_usd: Math.round(totalSpend7d * 100) / 100,
    sessions_7d: sevenDayEntries.length,
    avg_cost_per_session:
      sevenDayEntries.length > 0
        ? Math.round((totalSpend7d / sevenDayEntries.length) * 100) / 100
        : 0,
  };
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
    agentCost: collectAgentCost(),
    ciHealth: collectCiHealth(),
    lighthouse: collectLighthouse(),
    issues: collectGitHubIssues(),
    issueFeedback: collectIssueFeedback(),
    sessionLogs: collectSessionLogs(),
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
      case "issueFeedback":
        console.log(
          `   ${name}: ${data.category_count} categories, ${data.unhealthy_categories.length} unhealthy (>${Math.round(0.4 * 100)}% rejected)`
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
