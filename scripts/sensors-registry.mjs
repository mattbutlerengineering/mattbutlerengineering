/**
 * Sensors registry — single source of truth for each sensor's category,
 * issue labels, severity, verify function, and (for sensors that feed the
 * daily sensor report) its collect/format/regression-detection behavior.
 *
 * Consumers:
 *   - sensor-correlator derives CATEGORY_MAP / LABEL_MAP from this
 *   - verify-fixes resolves verifiers via getSensorByLabel()
 *   - producers (cors-audit, etc.) can call getLabelsForSensor()
 *   - build-sensor-report.mjs iterates SENSORS to assemble/format/detect
 *     regressions for every entry that carries a `collect` function
 *   - sensor-report.mjs (thin CLI shim) calls each entry's `collect(ctx)`
 *     to gather data, then hands the result to build-sensor-report
 *
 * Adding a report sensor: add one entry below with `collect`, `format`, and
 * (optionally) `detectRegression`. No other file needs to change.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { collectAgentCost } from "./collect-agent-cost.mjs";
import { collectCcusageSensor } from "./collect-ccusage.mjs";
import {
  computeCodeChurn,
  isGeneratedArtifact,
  CODE_CHURN_THRESHOLD,
} from "./collect-code-churn.mjs";
import { computePrCategoryMetrics } from "./collect-pr-metrics.mjs";
import { collectMutationScore } from "./collect-mutation-score.mjs";
import { computeFlakyTests } from "./collect-flaky-tests.mjs";
import { computeE2eStability } from "./collect-e2e-stability.mjs";
import {
  collectQueueEfficiency,
  QUEUE_EFFICIENCY_COMPOSITE_DROP,
  QUEUE_EFFICIENCY_FPS_DROP,
} from "./collect-queue-efficiency.mjs";
import { read } from "./metrics-store.mjs";
import { describeGhError } from "@mbe/gh-client";

/**
 * @typedef {{ verified: boolean; reason: string; confidence?: string }} VerifyResult
 * @typedef {{ root: string; now: Date; ghClient?: import("@mbe/gh-client").GhClient }} CollectContext
 * @typedef {{
 *   id: string;
 *   category: string;
 *   issueLabels?: string[];
 *   severity?: string;
 *   metricKeys?: Array<{ key: string; category?: string }>;
 *   verifyFix?: (title: string, body: string) => VerifyResult;
 *   reportKey?: string;
 *   collect?: (ctx: CollectContext) => object;
 *   format?: (data: object, name: string) => string;
 *   thresholds?: Record<string, number>;
 *   detectRegression?: (current: object, previous: object | undefined, thresholds: object) => object[];
 * }} SensorEntry
 */

/**
 * Runs fn, swallowing any error and returning fallback instead.
 * Shared by every collector below and by the sensor-report CLI shim.
 *
 * @param {() => unknown} fn
 * @param {unknown} [fallback]
 * @returns {unknown}
 */
export function safe(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * @param {string} path
 * @returns {unknown}
 */
export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

/**
 * Sidecar file threshold-tuner.mjs writes tuned regression thresholds to
 * (ADR-018). buildThresholds() overlays it onto per-sensor defaults at
 * read time; threshold-tuner.mjs is its single writer.
 */
export const REGRESSION_TUNABLES_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".github",
  "regression-tunables.json"
);

/**
 * Parse `git log --numstat` output into commit objects for the code-churn collector.
 * Uses execFileSync with an arg array — no shell interpolation, no injection risk.
 *
 * @param {string} root
 * @returns {Array<{ hash: string; timestamp: string; linesAdded: number; linesDeleted: number }>}
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
      const filePath = parts[2] ?? "";
      // Skip generated/vendored artifacts — they inflate churn without
      // reflecting real source instability (e.g. llms.txt, pnpm-lock.yaml,
      // Prisma clients, dep-graph.json).
      if (isGeneratedArtifact(filePath)) continue;
      const added = parseInt(parts[0], 10);
      const deleted = parseInt(parts[1], 10);
      if (!isNaN(added)) current = { ...current, linesAdded: current.linesAdded + added };
      if (!isNaN(deleted)) current = { ...current, linesDeleted: current.linesDeleted + deleted };
    }
  }
  if (current) commits.push(current);

  return commits;
}

/**
 * Wraps `gh pr list` for the queue-efficiency collector — includes the
 * `commits` field (needed for first-pass-success classification) and
 * normalises it to a `commitCount`.
 *
 * @param {import("@mbe/gh-client").GhClient} ghClient
 * @returns {Array<object> | null}
 */
export function readQueueEfficiencyPrs(ghClient) {
  const prs = safe(
    () =>
      // Limit to 45: GitHub's GraphQL caps nodes at 500k; the commits sub-field
      // multiplies PRs × ~11k potential nodes per PR. 45 sits safely under that ceiling.
      ghClient.pr.list([
        "--state",
        "all",
        "--limit",
        "45",
        "--json",
        "number,state,headRefName,createdAt,mergedAt,closedAt,labels,commits,additions,deletions",
      ]),
    null
  );
  if (!prs) return null;
  return prs.map((pr) => ({
    ...pr,
    commitCount: Array.isArray(pr.commits) ? pr.commits.length : (pr.commitCount ?? 1),
  }));
}

/**
 * Resolve the file paths changed by a CI run's head commit via the LOCAL git
 * object store, tolerating commits that are not present locally.
 *
 * CI-run head SHAs come from the GitHub API (`gh run list` / `ghClient`). A
 * stale local `main` or a squash-merged-and-deleted branch leaves those SHAs
 * absent from the local object store, so `git show <sha>` exits non-zero with
 * `fatal: bad object <sha>`. stderr is captured (not inherited) so that message
 * never spews, and the miss is signalled by returning `null` rather than
 * throwing — the caller counts and skips it.
 *
 * @param {string} sha
 * @param {string} root
 * @returns {string[] | null} changed paths, or `null` when the SHA is unresolvable locally
 */
export function resolveRunChangedPaths(sha, root) {
  try {
    return execFileSync("git", ["show", "--name-only", "--format=", sha], {
      encoding: "utf-8",
      timeout: 3000,
      cwd: root,
      // Capture stderr instead of inheriting it: a `fatal: bad object` line
      // per unresolvable SHA must not pollute the report's stderr.
      stdio: ["ignore", "pipe", "pipe"],
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * Map raw workflow-run rows into the shape `computeE2eStability` expects,
 * dropping runs whose head SHA cannot be resolved in the local git object
 * store. Unresolvable runs are tallied (so the caller can log a single
 * summary) rather than being kept with empty changed-paths — an empty list
 * would misclassify the run as non-frontend and distort the metric.
 *
 * `resolveChangedPaths` returns the changed paths for a resolvable SHA or
 * `null` when the object is missing; it is injectable for testing.
 *
 * @param {Array<{ headSha?: string; conclusion?: string; headBranch?: string; createdAt?: string }>} ghRuns
 * @param {(sha: string) => string[] | null} resolveChangedPaths
 * @returns {{ runs: Array<object>; unresolved: number }}
 */
export function buildE2eRuns(ghRuns, resolveChangedPaths) {
  const runs = [];
  let unresolved = 0;
  for (const run of ghRuns) {
    const changedPaths = run.headSha ? resolveChangedPaths(run.headSha) : null;
    if (changedPaths === null) {
      unresolved++;
      continue;
    }
    runs.push({
      sha: run.headSha ?? "",
      conclusion: run.conclusion,
      changedPaths,
      headRefName: run.headBranch ?? "",
      createdAt: run.createdAt,
    });
  }
  return { runs, unresolved };
}

/**
 * Registry of all known sensors.
 *
 * metricKeys entries use the sensor's default category unless an override is provided.
 * This matches the original CATEGORY_MAP where sentry:timeout_rate sits in "performance"
 * and ci:duration also sits in "performance" even though the sensor default is "availability".
 *
 * Entries that carry a `collect` function participate in the daily sensor report
 * (build-sensor-report.mjs); their `reportKey` (defaulting to `id`) is the key
 * under which their data lives in `report.sensors`. Entries without `collect`
 * (sentry, cors, bug) exist purely for issue-label/verification routing.
 *
 * @type {SensorEntry[]}
 */
export const SENSORS = [
  {
    id: "acmm",
    category: "quality",
    issueLabels: ["acmm"],
    severity: "medium",
    metricKeys: [{ key: "acmm:level" }, { key: "acmm:criteria_count" }],
    verifyFix: (_title, _body) => ({
      verified: false,
      reason: "ACMM verification deferred to verify-fixes acmm verifier",
      confidence: "skip",
    }),
    collect: ({ root }) => {
      const statePath = resolve(root, ".claude", "acmm", "state.json");
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
    },
    format: (data, name) =>
      `${name}: L${data.level} (${data.criteria_met}/${data.criteria_total} criteria)`,
  },
  {
    id: "prMetrics",
    category: "quality",
    collect: ({ root }) => {
      const data = safe(() => read("pr-acceptance", { root }));
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
    },
    format: (data, name) => `${name}: ${data.entry_count} entries`,
  },
  {
    id: "domainActivity",
    category: "quality",
    collect: ({ root }) => {
      const rows = safe(() => read("domain-metrics", { root }));
      if (!Array.isArray(rows) || rows.length === 0) return { available: false };

      const latest = rows[rows.length - 1];
      const reservations = latest.reservations ?? {};
      const deposits = latest.deposits ?? {};
      // "Created" = every reservation that existed for the venue that day,
      // regardless of where it ended up in the funnel (pending/confirmed
      // are still "created", just not yet resolved to cancelled/completed/no-show).
      const created =
        (reservations.pending ?? 0) +
        (reservations.confirmed ?? 0) +
        (reservations.cancelled ?? 0) +
        (reservations.completed ?? 0) +
        (reservations.noShow ?? 0);

      return {
        available: true,
        date: latest.date ?? null,
        venueId: latest.venueId ?? null,
        reservations_created: created,
        reservations_cancelled: reservations.cancelled ?? 0,
        reservations_completed: reservations.completed ?? 0,
        reservations_no_show: reservations.noShow ?? 0,
        deposits_held: deposits.held ?? 0,
        deposits_applied: deposits.applied ?? 0,
        deposits_refunded: deposits.refunded ?? 0,
        deposits_forfeited: deposits.forfeited ?? 0,
      };
    },
    format: (data, name) =>
      `${name}: ${data.reservations_created} created, ${data.reservations_cancelled} cancelled, ` +
      `${data.reservations_completed} completed, ${data.reservations_no_show} no-show, ` +
      `deposits held/applied/refunded/forfeited ${data.deposits_held}/${data.deposits_applied}/${data.deposits_refunded}/${data.deposits_forfeited} (${data.date ?? "unknown date"})`,
  },
  {
    id: "prCategoryMetrics",
    category: "quality",
    collect: ({ ghClient }) => {
      const prs = safe(
        () =>
          ghClient.pr.list([
            "--state",
            "all",
            "--limit",
            "100",
            "--json",
            "number,state,headRefName,mergedAt,closedAt,labels",
          ]),
        null
      );
      if (!prs) return { available: false };
      return computePrCategoryMetrics(prs);
    },
    format: (data, name) => {
      const categoryList = Object.keys(data.by_category ?? {}).join(", ") || "none";
      const noteStr = data.signal_note ? " [signal uninformative: fix-forward pattern]" : "";
      return `${name}: ${data.total_merged}/${data.total_prs} merged by category (${categoryList})${noteStr}`;
    },
  },
  {
    id: "agentCost",
    category: "cost",
    collect: ({ root, now }) => {
      // Single spend sink owned by agent-core's recordSpend seam (#2974).
      const spendPath = resolve(root, ".claude", "agent-spend", "sessions.jsonl");
      return collectAgentCost(spendPath, now);
    },
    format: (data, name) =>
      `${name} (per-issue attribution): $${data.spend_7d_usd} (7d), $${data.spend_today_usd} (today), ${data.sessions_7d} attributed sessions`,
  },
  {
    id: "ccusageCost",
    category: "cost",
    collect: ({ now }) => collectCcusageSensor(undefined, now),
    format: (data, name) =>
      `${name}: $${data.spend_30d_usd} (30d), $${data.spend_7d_usd} (7d), $${data.spend_today_usd} (today), cache_hit ${Math.round(data.cache_hit_rate * 100)}%`,
  },
  {
    id: "ci",
    reportKey: "ciHealth",
    category: "availability",
    issueLabels: ["ci-fix"],
    severity: "high",
    metricKeys: [
      { key: "ci:duration", category: "performance" },
      { key: "ci:pass_rate" },
      { key: "ci:failures" },
    ],
    verifyFix: (_title, _body) => ({
      verified: false,
      reason: "CI verification deferred to verify-fixes ci verifier",
      confidence: "skip",
    }),
    collect: ({ ghClient }) => {
      let runs;
      try {
        runs = ghClient.workflow.runs([
          "--limit",
          "30",
          "--json",
          "status,conclusion,createdAt,name",
        ]);
      } catch (err) {
        // Distinguishable from "no runs yet" (#3937) — a thrown error (e.g.
        // auth failure) is a query failure, not an empty-but-valid result.
        return { available: false, error: describeGhError(err) };
      }
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
    },
    format: (data, name) =>
      `${name}: ${data.pass_rate_pct}% pass rate (${data.passed}/${data.completed})`,
    thresholds: { ci_pass_rate_drop: 5 },
    detectRegression: (current, previous, thresholds) => {
      if (!current?.available || !previous?.available) return [];
      const delta = current.pass_rate_pct - previous.pass_rate_pct;
      if (delta < -thresholds.ci_pass_rate_drop) {
        return [
          {
            sensor: "ciHealth",
            metric: "pass_rate_pct",
            current: current.pass_rate_pct,
            previous: previous.pass_rate_pct,
            delta,
            severity: "high",
          },
        ];
      }
      return [];
    },
  },
  {
    id: "lighthouse",
    category: "performance",
    issueLabels: ["audit"],
    severity: "high",
    metricKeys: [
      { key: "lighthouse:performance" },
      { key: "lighthouse:speed-index" },
      { key: "lighthouse:a11y", category: "quality" },
      { key: "lighthouse:best-practices", category: "quality" },
      { key: "lighthouse:seo", category: "quality" },
    ],
    verifyFix: (_title, _body) => ({
      verified: false,
      reason: "Lighthouse verification deferred to verify-fixes audit verifier",
      confidence: "skip",
    }),
    collect: ({ root }) => {
      const invPath = resolve(root, ".audit-state", "inventory.json");
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
    },
    format: (data, name) => `${name}: ${data.scored_count} surfaces scored`,
    thresholds: { lighthouse_score_drop: 0.05 },
    detectRegression: (current, previous, thresholds) => {
      if (!current?.available || !previous?.available) return [];
      const regressions = [];
      for (const surface of current.surfaces ?? []) {
        const prevSurface = (previous.surfaces ?? []).find((s) => s.url === surface.url);
        if (!prevSurface) continue;

        for (const [category, score] of Object.entries(surface.scores)) {
          const prevScore = prevSurface.scores?.[category];
          if (prevScore == null) continue;
          const delta = score - prevScore;
          if (delta < -thresholds.lighthouse_score_drop) {
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
      return regressions;
    },
  },
  {
    id: "issues",
    category: "quality",
    collect: ({ ghClient, now }) => {
      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
      let issuesRaw;
      try {
        issuesRaw = ghClient.issue.list([
          "--state",
          "all",
          "--limit",
          "50",
          "--json",
          "number,state,labels,createdAt,closedAt",
        ]);
      } catch (err) {
        // Distinguishable from "no issues" (#3937) — a thrown error (e.g.
        // auth failure) is a query failure, not an empty-but-valid result.
        return { available: false, error: describeGhError(err) };
      }
      const recentIssues = issuesRaw.filter((i) => new Date(i.createdAt) >= sevenDaysAgo);
      const recentClosed = issuesRaw.filter(
        (i) => i.closedAt && new Date(i.closedAt) >= sevenDaysAgo
      );
      const openReady = issuesRaw.filter(
        (i) => i.state === "OPEN" && (i.labels ?? []).some((l) => l.name === "ready")
      );
      const agentFailed = issuesRaw.filter(
        (i) => i.state === "OPEN" && (i.labels ?? []).some((l) => l.name === "agent-failed")
      );

      return {
        available: true,
        created_7d: recentIssues.length,
        closed_7d: recentClosed.length,
        closure_rate:
          recentIssues.length > 0
            ? Math.round((recentClosed.length / recentIssues.length) * 100)
            : 100,
        queue_depth: openReady.length,
        agent_failed: agentFailed.length,
      };
    },
    format: (data, name) =>
      `${name}: ${data.created_7d} created, ${data.closed_7d} closed, ${data.queue_depth} ready`,
    detectRegression: (current, previous) => {
      if (!current?.available || !previous?.available) return [];
      if (current.closure_rate < 50 && previous.closure_rate >= 50) {
        return [
          {
            sensor: "issues",
            metric: "closure_rate",
            current: current.closure_rate,
            previous: previous.closure_rate,
            delta: current.closure_rate - previous.closure_rate,
            severity: "medium",
          },
        ];
      }
      return [];
    },
  },
  {
    id: "issueFeedback",
    category: "quality",
    collect: ({ root }) => {
      const data = safe(() => read("ai-issue-feedback", { root }));
      if (!data) return { available: false };
      // #3937: collect-ai-issue-feedback.mjs persists `{ error }` (instead of
      // leaving the file unwritten) when the underlying query failed — surface
      // that distinctly from "not yet collected".
      if (data.error) return { available: false, error: data.error };
      if (!data.categories) return { available: false };

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
    },
    format: (data, name) =>
      `${name}: ${data.category_count} categories, ${data.unhealthy_categories.length} unhealthy (>${Math.round(0.4 * 100)}% rejected)`,
  },
  {
    id: "sessionLogs",
    category: "quality",
    collect: ({ root, now }) => {
      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const logDir = resolve(root, ".claude", "session-logs");
      if (!existsSync(logDir)) return { available: false };

      const files = safe(
        () => readdirSync(logDir).filter((f) => f.endsWith(".json") && f !== ".gitkeep"),
        []
      );
      const recentFiles = files.filter((f) => {
        const fstat = safe(() => statSync(join(logDir, f)));
        return fstat && fstat.mtime >= sevenDaysAgo;
      });

      const sessions = recentFiles
        .map((f) => safe(() => readJson(join(logDir, f))))
        .filter(Boolean);

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
    },
    format: (data, name) =>
      `${name}: ${data.logs_7d} sessions (7d), ${data.total_commits_7d} commits`,
  },
  {
    id: "codeChurn",
    category: "quality",
    collect: ({ root, now }) => {
      const commits = parseGitNumstat(root);
      return computeCodeChurn(commits, now);
    },
    format: (data, name) =>
      `${name}: ${Math.round(data.churn_rate * 100)}% churn rate (${data.lines_churned_7d} deleted / ${data.total_lines_added_7d} added, 7d)`,
    thresholds: { code_churn_rate_max: CODE_CHURN_THRESHOLD },
    detectRegression: (current, previous, thresholds) => {
      if (!current?.available) return [];
      if (current.churn_rate > thresholds.code_churn_rate_max) {
        return [
          {
            sensor: "codeChurn",
            metric: "churn_rate",
            current: current.churn_rate,
            previous: previous?.churn_rate ?? null,
            delta:
              previous?.churn_rate != null
                ? Math.round((current.churn_rate - previous.churn_rate) * 1000) / 1000
                : null,
            severity: current.churn_rate > 0.5 ? "high" : "medium",
          },
        ];
      }
      return [];
    },
  },
  {
    id: "mutationScore",
    category: "quality",
    collect: ({ root, now }) => {
      const reportPath = resolve(root, "reports", "mutation", "mutation.json");
      const reportJson = safe(() => readJson(reportPath));
      return collectMutationScore(reportJson, now);
    },
    format: (data, name) =>
      `${name}: ${data.mutation_score}% (${data.killed}/${data.total_mutants} killed, threshold ${data.threshold}%) ${data.passes_threshold ? "PASS" : "BELOW TARGET"}`,
  },
  {
    id: "flakyTests",
    category: "quality",
    collect: () => computeFlakyTests([]),
    format: (data, name) =>
      `${name}: ${data.flaky_count} flaky (${data.total_runs} runs, ${data.window_shas} SHAs)`,
  },
  {
    id: "e2eStability",
    category: "availability",
    collect: ({ root, ghClient }) => {
      const ghRuns = safe(
        () =>
          ghClient.workflow.runs([
            "--limit",
            "30",
            "--json",
            "conclusion,createdAt,headBranch,headSha",
          ]),
        null
      );
      if (!ghRuns) return { available: false };

      // Resolve each run's changed paths locally, skipping (and tallying) any
      // head SHA not in the local object store — see resolveRunChangedPaths.
      const { runs, unresolved } = buildE2eRuns(ghRuns, (sha) => resolveRunChangedPaths(sha, root));
      if (unresolved > 0) {
        console.warn(
          `[e2eStability] ${unresolved} CI run head SHA(s) not in the local git object store ` +
            `(stale main or squash-deleted branches); skipped.`
        );
      }

      return computeE2eStability(runs);
    },
    format: (data, name) =>
      `${name}: ${data.consecutive_failures} consecutive failure(s) on non-frontend runs (${data.total_non_frontend_runs}/${data.total_runs} non-frontend)`,
  },
  {
    id: "sentry",
    category: "availability",
    issueLabels: ["sentry"],
    severity: "high",
    metricKeys: [
      { key: "sentry:timeout_rate", category: "performance" },
      { key: "sentry:error_rate" },
      { key: "sentry:error_count" },
    ],
    verifyFix: (_title, _body) => ({
      verified: false,
      reason: "Sentry verification not yet available — requires MCP authentication (#983)",
      confidence: "skip",
    }),
  },
  {
    id: "cors",
    category: "security",
    issueLabels: ["security", "audit"],
    severity: "critical",
    verifyFix: (_title, _body) => ({
      verified: false,
      reason: "CORS verification: re-run cors-audit.mjs to confirm no new findings",
      confidence: "low",
    }),
  },
  {
    id: "bug",
    category: "quality",
    issueLabels: ["bug"],
    severity: "medium",
    verifyFix: (_title, _body) => ({
      verified: false,
      reason: "Bug verification deferred to verify-fixes bug verifier",
      confidence: "skip",
    }),
  },
  {
    id: "queueEfficiency",
    category: "quality",
    issueLabels: ["meta-improvement"],
    severity: "medium",
    metricKeys: [
      { key: "queueEfficiency:composite" },
      { key: "queueEfficiency:first_pass_success_rate" },
      { key: "queueEfficiency:cost_per_issue", category: "performance" },
      { key: "queueEfficiency:time_to_merge", category: "performance" },
    ],
    verifyFix: (_title, _body) => ({
      verified: false,
      reason:
        "Queue efficiency verification: re-run sensor-report with --json and inspect queueEfficiency.composite vs baseline",
      confidence: "low",
    }),
    collect: ({ ghClient, now }) =>
      collectQueueEfficiency(() => readQueueEfficiencyPrs(ghClient), undefined, now),
    format: (data, name) => {
      const baselineStr =
        data.baseline != null
          ? ` (baseline ${data.baseline.composite_median?.toFixed(3)}, ${data.baseline.weeks_sampled}w)`
          : " (no baseline yet)";
      return `${name}: composite ${data.composite} | fps ${data.sub_metrics?.first_pass_success_rate} | ttm ${data.sub_metrics?.median_time_to_merge_hours}h | $${data.sub_metrics?.cost_per_issue_usd}/issue${baselineStr}`;
    },
    thresholds: {
      queue_efficiency_composite_drop: QUEUE_EFFICIENCY_COMPOSITE_DROP,
      queue_efficiency_fps_drop: QUEUE_EFFICIENCY_FPS_DROP,
    },
    detectRegression: (current, previous, thresholds) => {
      if (!current?.available) return [];
      const regressions = [...(current.regressions ?? [])];
      if (previous?.available) {
        const delta = current.composite - previous.composite;
        if (delta < -thresholds.queue_efficiency_composite_drop) {
          regressions.push({
            sensor: "queueEfficiency",
            metric: "composite_vs_previous_report",
            current: current.composite,
            previous: previous.composite,
            delta: Math.round(delta * 1000) / 1000,
            severity: delta < -0.15 ? "high" : "medium",
          });
        }
      }
      return regressions;
    },
  },
];

/**
 * Returns the first sensor entry whose issueLabels includes the given label,
 * or null if none matches.
 *
 * @param {string} label
 * @returns {SensorEntry | null}
 */
export function getSensorByLabel(label) {
  return SENSORS.find((s) => (s.issueLabels ?? []).includes(label)) ?? null;
}

/**
 * Returns a deduplicated list of all issue labels across all sensors.
 *
 * @returns {string[]}
 */
export function getAllLabels() {
  return [...new Set(SENSORS.flatMap((s) => s.issueLabels ?? []))];
}

/**
 * Returns the issue labels for a specific sensor id.
 *
 * @param {string} sensorId
 * @returns {string[]}
 */
export function getLabelsForSensor(sensorId) {
  const sensor = SENSORS.find((s) => s.id === sensorId);
  return sensor?.issueLabels ?? [];
}

/**
 * Builds the CATEGORY_MAP format expected by sensor-correlator:
 * { category → string[] of "sensorId:metric" keys }
 *
 * Metric keys use their per-entry category override if present,
 * otherwise fall back to the sensor's default category.
 *
 * @returns {Record<string, string[]>}
 */
export function buildCategoryMap() {
  /** @type {Record<string, string[]>} */
  const map = {};
  for (const sensor of SENSORS) {
    if (!sensor.metricKeys) continue;
    for (const entry of sensor.metricKeys) {
      const category = entry.category ?? sensor.category;
      map[category] = [...(map[category] ?? []), entry.key];
    }
  }
  return map;
}

/**
 * Builds the LABEL_MAP format expected by sensor-correlator:
 * { sensorId → primary issue label (first in issueLabels array) }
 *
 * Keyed by both `id` and `reportKey` (when set) — regression signals emitted
 * by a sensor's `detectRegression` use its `reportKey` (e.g. "ci"'s regressions
 * carry `sensor: "ciHealth"`), so the map must resolve either name to the
 * same label.
 *
 * @returns {Record<string, string>}
 */
export function buildLabelMap() {
  /** @type {Record<string, string>} */
  const map = {};
  for (const sensor of SENSORS) {
    if (!sensor.issueLabels || sensor.issueLabels.length === 0) continue;
    map[sensor.id] = sensor.issueLabels[0];
    if (sensor.reportKey) map[sensor.reportKey] = sensor.issueLabels[0];
  }
  return map;
}

/**
 * Collects every report-participating sensor's data. An expected "no data"
 * case (missing file, unreachable API) is handled inside the sensor's own
 * `collect` (usually via `safe()`) and returns `{ available: false }` directly.
 * This wrapper is the last-resort net for a genuinely unexpected collector
 * bug — it must not swallow silently, or the bug vanishes as a quiet
 * "not available" sensor instead of surfacing.
 *
 * @param {SensorEntry[]} entries - typically getReportSensors()
 * @param {CollectContext} ctx
 * @returns {Record<string, object>} keyed by each entry's reportKey (or id)
 */
export function collectReportSensors(entries, ctx) {
  return Object.fromEntries(
    entries.map((sensor) => {
      const key = sensor.reportKey ?? sensor.id;
      try {
        return [key, sensor.collect(ctx)];
      } catch (err) {
        console.error(`[sensor-report] unexpected error in "${sensor.id}" collector:`, err);
        return [key, { available: false }];
      }
    })
  );
}

/**
 * Returns the SENSORS entries that participate in the daily sensor report
 * (i.e. carry a `collect` function).
 *
 * @returns {SensorEntry[]}
 */
export function getReportSensors() {
  return SENSORS.filter((s) => typeof s.collect === "function");
}

/**
 * Threshold values with no current registry-entry consumer — legacy
 * placeholders from before per-sensor `detectRegression` logic existed.
 * Kept here (not sensor-report.mjs) purely for report-output parity;
 * drop once confirmed safe to remove.
 *
 * @type {Record<string, number>}
 */
const UNASSIGNED_THRESHOLDS = {
  agent_success_rate_drop: 10,
  error_rate_increase: 20,
  service_uptime_min: 99.5,
};

/**
 * Clamps a tuned threshold value to within ±50% of its registry default —
 * the hard bound from ADR-018's regression-threshold tuning policy (a
 * sensor can never be disabled by widening past +50%, nor made hair-trigger
 * by tightening past −50%). Shared by buildThresholds()'s defensive overlay
 * clamp and by threshold-tuner.mjs's pure tuning-policy function, so the
 * bound is defined exactly once.
 *
 * @param {number} value
 * @param {number} defaultValue
 * @returns {number}
 */
export function clampToDefaultRange(value, defaultValue) {
  return Math.min(defaultValue * 1.5, Math.max(defaultValue * 0.5, value));
}

/**
 * Reads the regression-thresholds sidecar file that threshold-tuner.mjs
 * writes. Missing file or malformed JSON → {} (no overrides) — this keeps
 * buildThresholds() safe to call before the sidecar exists or if it was
 * hand-edited into an invalid state.
 *
 * @param {string} [path]
 * @returns {Record<string, { regressionThreshold: number }>}
 */
export function readTunables(path = REGRESSION_TUNABLES_PATH) {
  if (!existsSync(path)) return {};
  return safe(() => readJson(path), {}) ?? {};
}

/**
 * Returns, for every registry sensor whose `thresholds` object has exactly
 * one key, that key's name and registry default value. The sidecar's shape
 * (`{ "<sensorId>": { "regressionThreshold": <number> } }`) can only express
 * a single scalar per sensor, so sensors with zero or multiple threshold
 * keys (e.g. "queueEfficiency", which has two) are not tunable via this seam.
 *
 * @returns {Record<string, { thresholdKey: string; defaultValue: number }>}
 */
export function getTunableSensorDefaults() {
  /** @type {Record<string, { thresholdKey: string; defaultValue: number }>} */
  const result = {};
  for (const sensor of SENSORS) {
    const keys = Object.keys(sensor.thresholds ?? {});
    if (keys.length !== 1) continue;
    result[sensor.id] = { thresholdKey: keys[0], defaultValue: sensor.thresholds[keys[0]] };
  }
  return result;
}

/**
 * Assembles the flat thresholds object consumed by buildReport/detectRegression,
 * merging each registry entry's co-located `thresholds` (in registry order) on
 * top of UNASSIGNED_THRESHOLDS, then overlaying any tuned value from the
 * regression-thresholds sidecar (ADR-018 — see REGRESSION_TUNABLES_PATH).
 * A sensor absent from the sidecar keeps its registry default; any overlay
 * value is defensively clamped to ±50% of that default in case the sidecar
 * was hand-edited out of bounds. This is the sensor-report shim's one seam
 * for thresholds — adding or tuning a sensor's threshold means editing its
 * entry here (or its tuned value in the sidecar), not a separate blob in
 * sensor-report.mjs.
 *
 * @param {string} [tunablesPath]
 * @returns {Record<string, number>}
 */
export function buildThresholds(tunablesPath = REGRESSION_TUNABLES_PATH) {
  const defaults = SENSORS.reduce((acc, sensor) => ({ ...acc, ...(sensor.thresholds ?? {}) }), {
    ...UNASSIGNED_THRESHOLDS,
  });

  const tunables = readTunables(tunablesPath);

  return Object.entries(getTunableSensorDefaults()).reduce(
    (acc, [sensorId, { thresholdKey, defaultValue }]) => {
      const override = tunables[sensorId]?.regressionThreshold;
      if (typeof override !== "number" || Number.isNaN(override)) return acc;
      return { ...acc, [thresholdKey]: clampToDefaultRange(override, defaultValue) };
    },
    defaults
  );
}
