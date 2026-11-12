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

/** GitHub search never returns more than this many results. */
export const SEARCH_CAP = 1000;

/**
 * @param {string} what what was searched, for the message
 * @param {number} count results returned
 * @returns {string|null} a warning when the search hit the cap, else null
 */
export function searchCapWarning(what, count) {
  return count >= SEARCH_CAP
    ? `warning: ${SEARCH_CAP} ${what} returned, GitHub's search maximum; the counts are incomplete. Use a shorter --since window.`
    : null;
}

function takeValue(argv, i, flag) {
  const value = argv[i + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value`);
  return value;
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  const opts = { since: null, limit: 100, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") opts.json = true;
    else if (arg === "--since") opts.since = takeValue(argv, i++, arg);
    else if (arg === "--limit") opts.limit = Number(takeValue(argv, i++, arg));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (opts.since !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.since)) {
      throw new Error(`--since must be YYYY-MM-DD, got ${opts.since}`);
    }
    const parsed = new Date(`${opts.since}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== opts.since) {
      throw new Error(`--since ${opts.since} is not a real date`);
    }
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
    String(since ? SEARCH_CAP : limit),
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
        String(SEARCH_CAP),
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
  for (const warning of [
    since ? searchCapWarning("merged PRs", prs.length) : null,
    searchCapWarning("closed issues", closed.length),
  ]) {
    if (warning) process.stderr.write(`${warning}\n`);
  }
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
