#!/usr/bin/env node

/**
 * PR-acceptance metric for the ACMM L3 ("Measured / Enforced") signal.
 *
 * Pulls recent PRs via the GitHub CLI, identifies AI-generated PRs via the
 * repo's canonical `isAiPr` predicate, computes acceptance rate, and appends
 * one dated entry to the pr-acceptance metric.
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

import { createGhClient } from "@mbe/gh-client";
import { read, write, resolvePath } from "./metrics-store.mjs";
import { isAiPr } from "./collect-queue-efficiency.mjs";

const METRICS_PATH = resolvePath("pr-acceptance");

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

/**
 * Filter PRs to those whose terminal event (merge or close) falls at or
 * after `sinceMs`. Open PRs are excluded — they haven't been decided yet.
 *
 * @param {PR[]} prs
 * @param {number} sinceMs
 * @returns {PR[]}
 */
export function filterPrsInWindow(prs, sinceMs) {
  return prs.filter((p) => {
    const terminal = p.mergedAt ?? p.closedAt;
    if (!terminal) return false;
    return new Date(terminal).getTime() >= sinceMs;
  });
}

/**
 * Build the pr-acceptance metric entry from an already-windowed set of PRs.
 *
 * AI-PR identification defers to `isAiPr`, the repo's canonical three-leg
 * predicate (agent-authored label / has-pr label / worker branch name) —
 * see `collect-queue-efficiency.mjs`. This module used to carry its own
 * four-branch-regex-plus-has-pr copy that omitted the `agent-authored` leg
 * entirely (#5012), undercounting genuinely agent-authored PRs that don't
 * match a branch regex.
 *
 * @param {PR[]} windowPrs
 * @param {number} days
 * @param {string} date - ISO date string (YYYY-MM-DD) for the entry.
 * @returns {{
 *   date: string,
 *   window_days: number,
 *   total_ai_prs: number,
 *   merged: number,
 *   rejected: number,
 *   acceptance_rate: number | null,
 * }}
 */
export function buildAcceptanceEntry(windowPrs, days, date) {
  const aiPrs = windowPrs.filter(isAiPr);
  const merged = aiPrs.filter((p) => p.mergedAt !== null);
  const rejected = aiPrs.filter((p) => p.state === "CLOSED" && p.mergedAt === null);
  const totalAiPrs = merged.length + rejected.length;
  const acceptanceRate =
    totalAiPrs === 0 ? null : Math.round((merged.length / totalAiPrs) * 100) / 100;

  return {
    date,
    window_days: days,
    total_ai_prs: totalAiPrs,
    merged: merged.length,
    rejected: rejected.length,
    acceptance_rate: acceptanceRate,
  };
}

/**
 * CLI entrypoint — pulls PRs via `gh`, computes the entry, prints a summary,
 * and persists it (unless `--dry-run`).
 */
export function run() {
  const args = process.argv.slice(2);
  const DRY_RUN = args.includes("--dry-run");
  const daysIdx = args.indexOf("--days");
  const DAYS = daysIdx >= 0 ? parseInt(args[daysIdx + 1] ?? "30", 10) : 30;

  const sinceMs = Date.now() - DAYS * 24 * 60 * 60 * 1000;
  const since = new Date(sinceMs).toISOString().slice(0, 10);

  const ghClient = createGhClient();

  /** @type {PR[]} */
  let allPrs;
  try {
    allPrs = ghClient.pr.list([
      "--state",
      "all",
      "--limit",
      "300",
      "--json",
      "number,title,state,headRefName,createdAt,closedAt,mergedAt,labels",
    ]);
  } catch (err) {
    console.error(`gh pr list failed: ${err.message}`);
    process.exit(1);
    return;
  }

  const windowPrs = filterPrsInWindow(allPrs, sinceMs);
  const date = new Date().toISOString().slice(0, 10);
  const entry = buildAcceptanceEntry(windowPrs, DAYS, date);

  console.log("");
  console.log(`PR acceptance metric — last ${DAYS} days (since ${since})`);
  console.log("");
  console.log(
    `  Total AI PRs decided: ${entry.total_ai_prs}  (merged: ${entry.merged}, rejected: ${entry.rejected})`
  );
  if (entry.total_ai_prs > 0) {
    console.log(`  Acceptance rate:      ${(entry.acceptance_rate * 100).toFixed(1)}%`);
  }
  console.log("");

  if (DRY_RUN) {
    console.log("--dry-run: not writing. Entry would have been:");
    console.log(JSON.stringify(entry, null, 2));
    return;
  }

  // Read existing entries (missing / corrupt / non-array → start fresh),
  // then append and persist through the metrics store.
  let entries = [];
  try {
    const existing = read("pr-acceptance");
    if (Array.isArray(existing)) {
      entries = existing;
    } else if (existing !== null) {
      console.error(`Expected array in ${METRICS_PATH}, got ${typeof existing}. Resetting.`);
    }
  } catch {
    console.error(`Failed to parse ${METRICS_PATH}. Starting fresh.`);
  }

  entries.push(entry);
  write("pr-acceptance", entries);

  console.log(`Appended entry to: ${METRICS_PATH}`);
  console.log(`Total entries: ${entries.length}`);
}

// Run when invoked directly (not imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}
