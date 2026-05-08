#!/usr/bin/env node

/**
 * PR-acceptance metric for the ACMM L3 ("Measured / Enforced") signal.
 *
 * Pulls recent PRs via the GitHub CLI, identifies AI-generated PRs by
 * branch name patterns or labels, computes acceptance rate, and appends
 * one dated entry to docs/metrics/pr-acceptance.json.
 *
 * Usage:
 *   node scripts/pr-metrics.mjs                 # default: last 30 days
 *   node scripts/pr-metrics.mjs --days 90       # configurable window
 *   node scripts/pr-metrics.mjs --dry-run       # compute + print, do not persist
 *
 * Why this exists (acmm:pr-acceptance-metric, L3 feedback-loop):
 *   The L3 maturity signal is "we measure the AI loop itself, not just
 *   the code." Acceptance rate is the simplest meta-metric: of the AI PRs
 *   we open, what fraction merges? A drop across two consecutive runs is
 *   the earliest signal that something in the loop has regressed.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const METRICS_PATH = resolve(__dirname, "..", "docs", "metrics", "pr-acceptance.json");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const daysIdx = args.indexOf("--days");
const DAYS = daysIdx >= 0 ? parseInt(args[daysIdx + 1] ?? "30", 10) : 30;

/* ── 1. Pull PRs from gh CLI ─────────────────────────────── */

const sinceMs = Date.now() - DAYS * 24 * 60 * 60 * 1000;
const since = new Date(sinceMs).toISOString().slice(0, 10);

let prsRaw;
try {
  prsRaw = execFileSync(
    "gh",
    [
      "pr",
      "list",
      "--state",
      "all",
      "--limit",
      "300",
      "--json",
      "number,title,state,headRefName,createdAt,closedAt,mergedAt,labels",
    ],
    { encoding: "utf-8" }
  );
} catch (err) {
  console.error(`gh pr list failed: ${err.message}`);
  process.exit(1);
}

/**
 * @typedef {{
 *   number: number,
 *   title: string,
 *   state: string,
 *   headRefName: string,
 *   createdAt: string,
 *   closedAt: string | null,
 *   mergedAt: string | null,
 *   labels: Array<{ name: string }>
 * }} PR
 */

/** @type {PR[]} */
const allPrs = JSON.parse(prsRaw);

// Filter to PRs whose terminal event (merge or close) is within the window.
// Open PRs are excluded — they haven't been decided yet.
const prs = allPrs.filter((p) => {
  const terminal = p.mergedAt ?? p.closedAt;
  if (!terminal) return false;
  return new Date(terminal).getTime() >= sinceMs;
});

/* ── 2. Identify AI-generated PRs ────────────────────────── */

/** @type {RegExp[]} */
const AI_BRANCH_PATTERNS = [/^agent-/, /^worktree-agent-/, /^fix\/agent-/, /^feat\/agent-/];

/**
 * A PR is considered AI-generated if its branch name matches one of the
 * known agent patterns, or it carries the `has-pr` label (applied by
 * mbe-issue-worker after a successful agent run).
 *
 * @param {PR} pr
 * @returns {boolean}
 */
function isAiPr(pr) {
  const branch = pr.headRefName ?? "";
  if (AI_BRANCH_PATTERNS.some((re) => re.test(branch))) return true;
  if (pr.labels?.some((l) => l.name === "has-pr")) return true;
  return false;
}

/* ── 3. Compute metrics ──────────────────────────────────── */

const aiPrs = prs.filter(isAiPr);
const merged = aiPrs.filter((p) => p.mergedAt !== null);
const rejected = aiPrs.filter((p) => p.state === "CLOSED" && p.mergedAt === null);
const totalAiPrs = merged.length + rejected.length;
const acceptanceRate =
  totalAiPrs === 0 ? null : Math.round((merged.length / totalAiPrs) * 100) / 100;

/* ── 4. Build entry ──────────────────────────────────────── */

const date = new Date().toISOString().slice(0, 10);

const entry = {
  date,
  window_days: DAYS,
  total_ai_prs: totalAiPrs,
  merged: merged.length,
  rejected: rejected.length,
  acceptance_rate: acceptanceRate,
};

/* ── 5. Print summary ────────────────────────────────────── */

console.log("");
console.log(`PR acceptance metric — last ${DAYS} days (since ${since})`);
console.log("");
console.log(
  `  Total AI PRs decided: ${totalAiPrs}  (merged: ${merged.length}, rejected: ${rejected.length})`
);
if (totalAiPrs > 0) {
  console.log(`  Acceptance rate:      ${(acceptanceRate * 100).toFixed(1)}%`);
}
console.log("");

/* ── 6. Persist ──────────────────────────────────────────── */

if (DRY_RUN) {
  console.log("--dry-run: not writing. Entry would have been:");
  console.log(JSON.stringify(entry, null, 2));
  process.exit(0);
}

// Read existing entries (or start with empty array)
let entries = [];
if (existsSync(METRICS_PATH)) {
  try {
    const raw = readFileSync(METRICS_PATH, "utf-8");
    entries = JSON.parse(raw);
    if (!Array.isArray(entries)) {
      console.error(`Expected array in ${METRICS_PATH}, got ${typeof entries}. Resetting.`);
      entries = [];
    }
  } catch {
    console.error(`Failed to parse ${METRICS_PATH}. Starting fresh.`);
    entries = [];
  }
}

entries.push(entry);

// Ensure directory exists, then write
mkdirSync(dirname(METRICS_PATH), { recursive: true });
writeFileSync(METRICS_PATH, JSON.stringify(entries, null, 2) + "\n", "utf-8");

console.log(`Appended entry to: ${METRICS_PATH}`);
console.log(`Total entries: ${entries.length}`);
