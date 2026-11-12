#!/usr/bin/env node
/**
 * work-mix-report.mjs — what the pipeline spends its capacity on.
 *
 * Re-runnable measurement behind docs/fixes/dev-slowness-2026-11-11/rca.md:
 * the type mix of merged PRs, the source labels of closed issues, and how long
 * open tracking issues have been open. Read-only; it only calls `gh`.
 *
 * Usage: node scripts/work-mix-report.mjs [--since YYYY-MM-DD] [--limit N] [--json]
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CONVENTIONAL_TYPES = new Set([
  "feat",
  "fix",
  "chore",
  "test",
  "docs",
  "ci",
  "refactor",
  "perf",
  "revert",
  "build",
  "style",
]);

export const WATCHED_ISSUE_LABELS = [
  "feature",
  "ci-fix",
  "bug",
  "audit",
  "sentry",
  "ux",
  "feature-proposal",
];

const DAY_MS = 86_400_000;

/** @param {string} title */
export function classifyTitle(title) {
  const match = /^([a-z]+)(\([^)]*\))?!?:/.exec(title);
  return match && CONVENTIONAL_TYPES.has(match[1]) ? match[1] : "other";
}

/** @param {Array<{ title: string }>} prs */
export function summarizeWorkMix(prs) {
  const counts = new Map();
  for (const pr of prs) {
    const type = classifyTitle(pr.title);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const total = prs.length;
  const byType = [...counts.entries()]
    .map(([type, count]) => ({ type, count, sharePct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  return { total, byType };
}

/**
 * @param {Array<{ labels: Array<{ name: string }> }>} issues
 * @param {string[]} watched
 */
export function countIssueLabels(issues, watched) {
  return watched
    .map((label) => ({
      label,
      count: issues.filter((i) => i.labels.some((l) => l.name === label)).length,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * @param {Array<{ number: number, title: string, createdAt: string }>} issues
 * @param {number} now epoch ms
 */
export function openTrackingAges(issues, now) {
  return issues
    .map(({ number, title, createdAt }) => ({
      number,
      title,
      ageDays: Math.round(((now - Date.parse(createdAt)) / DAY_MS) * 10) / 10,
    }))
    .sort((a, b) => b.ageDays - a.ageDays);
}

function gh(args) {
  return JSON.parse(execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
}

function parseArgs(argv) {
  const opts = { since: null, limit: 100, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") opts.json = true;
    else if (arg === "--since") opts.since = argv[++i];
    else if (arg === "--limit") opts.limit = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (opts.since && !/^\d{4}-\d{2}-\d{2}$/.test(opts.since)) {
    throw new Error(`--since must be YYYY-MM-DD, got ${opts.since}`);
  }
  if (!Number.isInteger(opts.limit) || opts.limit < 1) {
    throw new Error(`--limit must be a positive integer`);
  }
  return opts;
}

function collect({ since, limit }) {
  const window = since ? ["--search", `merged:>=${since}`] : [];
  const prs = gh([
    "pr",
    "list",
    "--state",
    "merged",
    "--limit",
    String(since ? 1000 : limit),
    ...window,
    "--json",
    "title",
  ]);
  const closed = since
    ? gh([
        "issue",
        "list",
        "--state",
        "closed",
        "--limit",
        "1000",
        "--search",
        `closed:>=${since}`,
        "--json",
        "labels",
      ])
    : [];
  const tracking = gh([
    "issue",
    "list",
    "--state",
    "open",
    "--label",
    "tracking",
    "--limit",
    "100",
    "--json",
    "number,title,createdAt",
  ]);
  return {
    window: since ? `since ${since}` : `last ${limit} merged PRs`,
    workMix: summarizeWorkMix(prs),
    closedIssueLabels: since ? countIssueLabels(closed, WATCHED_ISSUE_LABELS) : null,
    openTracking: openTrackingAges(tracking, Date.now()),
  };
}

function render(report) {
  const lines = [`Work mix (${report.window}): ${report.workMix.total} merged PRs`];
  for (const t of report.workMix.byType) {
    lines.push(`  ${t.type.padEnd(9)} ${t.count} (${t.sharePct}%)`);
  }
  if (report.closedIssueLabels) {
    lines.push("Closed issues by source label:");
    for (const l of report.closedIssueLabels) lines.push(`  ${l.label.padEnd(17)} ${l.count}`);
  }
  lines.push("Open tracking issues (oldest first):");
  for (const t of report.openTracking) lines.push(`  #${t.number} ${t.ageDays}d ${t.title}`);
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const report = collect(opts);
    process.stdout.write(opts.json ? `${JSON.stringify(report, null, 2)}\n` : render(report));
  } catch (err) {
    console.error(`work-mix-report: ${err.message}`);
    process.exit(1);
  }
}
