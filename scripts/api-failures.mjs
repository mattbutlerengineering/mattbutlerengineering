#!/usr/bin/env node

/**
 * API failures — weekly report of API endpoints under the api prefix that fail or run slow at
 * the edge, read from the `edge_requests` Analytics Engine dataset
 * (infrastructure/worker/edge-router.js → analytics-schema.js), filing one
 * GitHub issue per breaching endpoint (#7545). sentry-triage.yml covers thrown
 * exceptions; this covers 4xx/5xx rates and slow responses that never throw.
 *
 * Usage: node scripts/api-failures.mjs [--dry-run]
 *
 * Required env vars:
 *   CLOUDFLARE_API_TOKEN   — Account · Account Analytics · Read (NOT the scope
 *                            MBE_CLOUDFLARE_API_TOKEN carries; see
 *                            docs/runbooks/edge-usage.md § Token provisioning)
 *   CLOUDFLARE_ACCOUNT_ID  — CF account ID (not a credential)
 *   GH_TOKEN               — for `gh` (issues: write); GITHUB_REPOSITORY optional
 *
 * Fails closed: a missing credential, a query error or zero rows for the whole
 * window exits 1 — a silent skip must never read as "no failures"
 * (gotchas § Metrics / staleness detection).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  EDGE_REQUESTS_COLUMNS,
  EDGE_REQUESTS_DATASET,
} from "../infrastructure/worker/analytics-schema.js";
import { queryEdgeUsage } from "./edge-usage.mjs";

const execFileAsync = promisify(execFile);

export const WINDOW_DAYS = 7;
export const MAX_NEW_ISSUES = 5;
export const THRESHOLDS = Object.freeze({
  rate5xx: 0.01,
  min5xx: 20,
  rate4xx: 0.1,
  min4xx: 50,
  p95Ms: 2000,
});
const API_PREFIX = "/api";
export const QUERY_ROW_LIMIT = 10000;
const P95_QUANTILE = 0.95;
const DEFAULT_REPO = "mattbutlerengineering/mattbutlerengineering";
const ISSUE_LABELS = ["ready", "bug", "production-health"];
// Mirrors the DO ingress order in infrastructure/pulumi/index.ts: /api/v1/users
// -> users-api, /api/gen -> agent-api, every other /api path -> reservations-api.
// Not derived from `route` (blob1): the edge router always writes "api" there.
const AREA_RULES = Object.freeze([
  { prefix: `${API_PREFIX}/v1/users`, label: "area:users" },
  { prefix: `${API_PREFIX}/gen`, label: "area:agent" },
]);
const DEFAULT_AREA_LABEL = "area:reservations";
// 401/404 on auth-gated reads are expected traffic, not endpoint failures.
const EXPECTED_READ_STATUSES = new Set([401, 404]);
const READ_METHODS = new Set(["GET", "HEAD"]);
const OPEN_ISSUE_LIMIT = "200";

const USAGE = `Usage: node scripts/api-failures.mjs [--dry-run]

Weekly /api failure and latency report over the ${EDGE_REQUESTS_DATASET} dataset;
files or updates one issue per breaching endpoint. --dry-run prints the report
and the issues it would file without writing.`;

// ── Path normalization ───────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isIdSegment(segment) {
  if (/^\d+$/.test(segment)) return true;
  if (UUID.test(segment)) return true;
  if (/^[0-9a-f]{8,}$/i.test(segment) && /\d/.test(segment)) return true;
  // Prefixed / opaque tokens (res_9fA3kLq2Zx81, ULIDs): long and mixing digits.
  return segment.length >= 12 && /\d/.test(segment) && /[a-z]/i.test(segment);
}

/** Collapse ID-looking segments to `:id` and drop a trailing slash. */
export function normalizePath(pathname) {
  const segments = pathname.split("/").map((s) => (s !== "" && isIdSegment(s) ? ":id" : s));
  const joined = segments.join("/");
  return joined.length > 1 ? joined.replace(/\/+$/, "") : joined;
}

// ── Query ────────────────────────────────────────────────────────────

/** One row per method, raw pathname and status; grouping happens in aggregate(). */
export function buildFailuresQuery() {
  const c = EDGE_REQUESTS_COLUMNS;
  return [
    `SELECT ${c.method} AS method, ${c.pathname} AS pathname, ${c.status} AS status,`,
    `SUM(_sample_interval) AS requests,`,
    `quantileExactWeighted(${P95_QUANTILE})(${c.elapsedMs}, _sample_interval) AS p95`,
    `FROM ${EDGE_REQUESTS_DATASET}`,
    `WHERE timestamp > NOW() - INTERVAL '${WINDOW_DAYS}' DAY AND ${c.pathname} LIKE '${API_PREFIX}/%'`,
    `GROUP BY method, pathname, status`,
    `LIMIT ${QUERY_ROW_LIMIT}`,
    `FORMAT JSONEachRow`,
  ].join("\n");
}

// ── Aggregation ──────────────────────────────────────────────────────

/** Request-weighted 95th percentile of per-row p95 values. */
function weightedP95(entries) {
  const sorted = [...entries].sort((a, b) => a.p95 - b.p95);
  const total = sorted.reduce((sum, e) => sum + e.weight, 0);
  let seen = 0;
  for (const entry of sorted) {
    seen += entry.weight;
    if (seen >= total * P95_QUANTILE) return entry.p95;
  }
  return sorted.length > 0 ? sorted[sorted.length - 1].p95 : 0;
}

function countsAs4xx(method, status) {
  if (status < 400 || status >= 500) return false;
  return !(READ_METHODS.has(method) && EXPECTED_READ_STATUSES.has(status));
}

function summarize(method, path, rows) {
  const total = rows.reduce((sum, r) => sum + r.requests, 0);
  const count5xx = rows.filter((r) => r.status >= 500).reduce((s, r) => s + r.requests, 0);
  const count4xx = rows
    .filter((r) => countsAs4xx(method, r.status))
    .reduce((s, r) => s + r.requests, 0);
  const byStatus = new Map();
  for (const r of rows) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + r.requests);
  const topStatuses = [...byStatus.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  return {
    method,
    path,
    total,
    count5xx,
    count4xx,
    rate5xx: total > 0 ? count5xx / total : 0,
    rate4xx: total > 0 ? count4xx / total : 0,
    p95: weightedP95(rows.map((r) => ({ p95: r.p95, weight: r.requests }))),
    topStatuses,
  };
}

/** Group SQL rows by method and normalized path. */
export function aggregate(sqlRows) {
  const grouped = new Map();
  for (const raw of sqlRows) {
    const row = {
      method: String(raw.method),
      path: normalizePath(String(raw.pathname)),
      status: Number(raw.status),
      requests: Number(raw.requests),
      p95: Number(raw.p95),
    };
    const key = `${row.method} ${row.path}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return [...grouped.values()].map((rows) => summarize(rows[0].method, rows[0].path, rows));
}

const pct = (rate) => `${(rate * 100).toFixed(1)}%`;

/** Breach reasons for one group; empty means healthy. */
export function classify(group) {
  const reasons = [];
  if (group.total >= THRESHOLDS.min5xx && group.count5xx / group.total >= THRESHOLDS.rate5xx) {
    reasons.push(
      `5xx rate ${pct(group.count5xx / group.total)} (${group.count5xx}/${group.total})`
    );
  }
  if (group.total >= THRESHOLDS.min4xx && group.count4xx / group.total >= THRESHOLDS.rate4xx) {
    reasons.push(
      `4xx rate ${pct(group.count4xx / group.total)} (${group.count4xx}/${group.total})`
    );
  }
  if (group.p95 >= THRESHOLDS.p95Ms) {
    reasons.push(`p95 ${Math.round(group.p95)} ms`);
  }
  return reasons;
}

// ── Issue content and planning ───────────────────────────────────────

export function markerFor(group) {
  return `<!-- api-failures:${group.method} ${group.path} -->`;
}

export function areaLabelFor(path) {
  const rule = AREA_RULES.find(({ prefix }) => path === prefix || path.startsWith(`${prefix}/`));
  return rule ? rule.label : DEFAULT_AREA_LABEL;
}

export function buildIssueTitle(group, reasons) {
  return `api-failures: ${group.method} ${group.path} — ${reasons.join("; ")}`;
}

export function buildIssueBody(group, reasons, days, truncated = false) {
  const statuses = group.topStatuses.map((s) => `${s.status}: ${s.count}`).join(", ") || "n/a";
  return [
    `\`${group.method} ${group.path}\` breached an api-failures threshold over the last ${days} days.`,
    "",
    ...reasons.map((r) => `- ${r}`),
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| Window | last ${days} days |`,
    `| Requests | ${group.total} |`,
    `| 5xx | ${group.count5xx} (${pct(group.rate5xx)}) |`,
    `| 4xx (excl. 401/404 on reads) | ${group.count4xx} (${pct(group.rate4xx)}) |`,
    `| p95 elapsedMs | ${Math.round(group.p95)} |`,
    `| Top status codes | ${statuses} |`,
    "",
    ...(truncated
      ? [`> Warning: the query hit its ${QUERY_ROW_LIMIT}-row limit, so counts may be low.`, ""]
      : []),
    "Source: `edge_requests` Analytics Engine dataset; see docs/runbooks/edge-usage.md.",
    "",
    markerFor(group),
  ].join("\n");
}

const severity = (g) => [g.rate5xx, g.rate4xx, g.p95];

function bySeverityDesc(a, b) {
  const [sa, sb] = [severity(a.group), severity(b.group)];
  for (let i = 0; i < sa.length; i += 1) if (sa[i] !== sb[i]) return sb[i] - sa[i];
  return 0;
}

/**
 * Decide what to write. Breaching groups with an open marker issue get a
 * comment (uncapped); the rest are filed worst-first up to MAX_NEW_ISSUES.
 */
export function planActions(groups, openIssues, days, truncated = false) {
  const breaching = groups
    .map((group) => ({ group, reasons: classify(group) }))
    .filter(({ reasons }) => reasons.length > 0)
    .sort(bySeverityDesc);

  const comment = [];
  const fresh = [];
  for (const { group, reasons } of breaching) {
    const existing = openIssues.find((issue) => (issue.body ?? "").includes(markerFor(group)));
    const item = {
      group,
      reasons,
      title: buildIssueTitle(group, reasons),
      body: buildIssueBody(group, reasons, days, truncated),
    };
    if (existing) comment.push({ ...item, number: existing.number });
    else fresh.push(item);
  }
  return {
    create: fresh.slice(0, MAX_NEW_ISSUES),
    comment,
    deferred: fresh.slice(MAX_NEW_ISSUES),
  };
}

// ── Entry ────────────────────────────────────────────────────────────

async function defaultGh(args) {
  const { stdout } = await execFileAsync("gh", args, { maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

function requireEnv(env, name) {
  if (!env[name]) throw new Error(`Missing required environment variable: ${name}`);
  return env[name];
}

function formatReport(groups) {
  const lines = groups
    .slice()
    .sort((a, b) => b.total - a.total)
    .map(
      (g) =>
        `${g.method.padEnd(7)} ${g.path}  total=${g.total} 5xx=${g.count5xx} (${pct(g.rate5xx)}) 4xx=${g.count4xx} (${pct(g.rate4xx)}) p95=${Math.round(g.p95)}ms`
    );
  return `${lines.join("\n")}\n\n${groups.length} endpoint(s) over the last ${WINDOW_DAYS} day(s)\n`;
}

function describePlan(plan) {
  const lines = [
    ...plan.create.map(
      (i) => `WOULD FILE: ${i.title} [${[...ISSUE_LABELS, areaLabelFor(i.group.path)].join(", ")}]`
    ),
    ...plan.comment.map((i) => `WOULD COMMENT on #${i.number}: ${i.title}`),
    ...plan.deferred.map((i) => `DEFERRED (over the ${MAX_NEW_ISSUES}-issue cap): ${i.title}`),
  ];
  return lines.length > 0 ? `${lines.join("\n")}\n` : "No endpoint breached a threshold.\n";
}

async function applyPlan({ plan, gh, repo, stderr }) {
  let failed = false;
  const attempt = async (args) => {
    try {
      await gh(args);
    } catch (err) {
      failed = true;
      stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    }
  };
  for (const item of plan.create) {
    const labels = [...ISSUE_LABELS, areaLabelFor(item.group.path)].flatMap((l) => ["--label", l]);
    await attempt([
      "issue",
      "create",
      "--repo",
      repo,
      "--title",
      item.title,
      "--body",
      item.body,
      ...labels,
    ]);
  }
  for (const item of plan.comment) {
    await attempt(["issue", "comment", String(item.number), "--repo", repo, "--body", item.body]);
  }
  return !failed;
}

/**
 * RETURNS the exit code; only the entry guard calls process.exit, so every
 * fail-closed path is unit-testable.
 *
 * @returns {Promise<0 | 1>}
 */
export async function main(env, deps = {}) {
  const {
    fetchImpl = fetch,
    gh = defaultGh,
    argv = [],
    stdout = process.stdout,
    stderr = process.stderr,
  } = deps;

  const dryRun = argv.includes("--dry-run");
  if (argv.some((a) => a !== "--dry-run")) {
    stderr.write(
      `Unknown argument(s): ${argv.filter((a) => a !== "--dry-run").join(" ")}\n\n${USAGE}\n`
    );
    return 1;
  }

  try {
    const token = requireEnv(env, "CLOUDFLARE_API_TOKEN");
    const accountId = requireEnv(env, "CLOUDFLARE_ACCOUNT_ID");
    const repo = env.GITHUB_REPOSITORY || DEFAULT_REPO;
    const rows = await queryEdgeUsage({ fetchImpl, accountId, token, sql: buildFailuresQuery() });
    if (rows.length === 0) {
      throw new Error(
        "Query returned zero rows for the whole window — refusing to report 'no failures' (see docs/runbooks/edge-usage.md)"
      );
    }

    const truncated = rows.length >= QUERY_ROW_LIMIT;
    if (truncated) {
      stderr.write(
        `Warning: result truncated at the ${QUERY_ROW_LIMIT}-row limit; counts may be low.\n`
      );
    }
    const groups = aggregate(rows);
    stdout.write(formatReport(groups));

    const listed = await gh([
      "issue",
      "list",
      "--repo",
      repo,
      "--label",
      "production-health",
      "--state",
      "open",
      "--limit",
      OPEN_ISSUE_LIMIT,
      "--json",
      "number,body",
    ]);
    const plan = planActions(groups, JSON.parse(listed || "[]"), WINDOW_DAYS, truncated);
    stdout.write(describePlan(plan));
    if (dryRun) return 0;

    return (await applyPlan({ plan, gh, repo, stderr })) ? 0 : 1;
  } catch (err) {
    stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.env, { argv: process.argv.slice(2) }).then((code) => process.exit(code));
}
