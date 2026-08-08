#!/usr/bin/env node

/**
 * Collect accept/reject/wontfix rates for AI-created issues by category.
 *
 * Queries GitHub for closed issues with AI-associated labels,
 * classifies each as accepted (merged PR), rejected (closed without merge),
 * or wontfix, and stores per-category rates in the ai-issue-feedback metric.
 *
 * Usage:
 *   node scripts/collect-ai-issue-feedback.mjs              # collect and persist
 *   node scripts/collect-ai-issue-feedback.mjs --dry-run    # print only
 *   node scripts/collect-ai-issue-feedback.mjs --json       # output raw JSON to stdout
 */

import { createGhClient, describeGhError } from "@mbe/gh-client";
import { read, write, resolvePath } from "./metrics-store.mjs";

const FEEDBACK_PATH = resolvePath("ai-issue-feedback");

/**
 * Categories tracked for AI issue feedback.
 * Maps to GitHub labels used by various skills.
 */
export const CATEGORIES = [
  "audit",
  "ci-fix",
  "agent-failed",
  "meta-improvement",
  "sentry",
  "acmm",
  "feature",
  "dependencies",
];

/** Default max issues per run for each category */
export const DEFAULT_BUDGET_PER_CATEGORY = 3;

/**
 * Fields passed to `gh issue list --json`.
 * Must only contain fields valid for `gh issue list --json`
 * (`linkedBranches` is NOT a valid field — use `stateReason`/`state` instead).
 */
export const ISSUE_JSON_FIELDS = "number,state,labels,createdAt,closedAt,stateReason";

/** Rejection rate above which the budget is halved */
export const REJECTION_THRESHOLD = 0.4;

/**
 * Classify a closed issue as accepted, rejected, or wontfix.
 *
 * - accepted: has at least one merged linked PR
 * - rejected: closed with stateReason NOT_PLANNED (user explicitly rejected)
 * - wontfix: closed COMPLETED but no merged PR (resolved without code change)
 * - null: issue is still open
 *
 * @param {object} issue - GitHub issue with state, stateReason, linkedPrs
 * @returns {"accepted" | "rejected" | "wontfix" | null}
 */
export function classifyIssue(issue) {
  if (issue.state === "OPEN") {
    return null;
  }

  const hasMergedPr = (issue.linkedPrs ?? []).some((pr) => pr.state === "MERGED");
  if (hasMergedPr) {
    return "accepted";
  }

  if (issue.stateReason === "NOT_PLANNED") {
    return "rejected";
  }

  return "wontfix";
}

/**
 * Compute per-category acceptance/rejection rates from a list of issues.
 * Each issue is counted in the first matching category only (no double-counting).
 *
 * @param {object[]} issues - Array of GitHub issues with labels, state, linkedPrs, stateReason
 * @returns {Record<string, { total: number, accepted: number, rejected: number, wontfix: number, rejection_rate: number }>}
 */
export function computeCategoryRates(issues) {
  /** @type {Record<string, { total: number, accepted: number, rejected: number, wontfix: number }>} */
  const counts = {};

  for (const issue of issues) {
    const classification = classifyIssue(issue);
    if (classification === null) continue;

    const issueLabels = (issue.labels ?? []).map((l) => l.name);
    const category = CATEGORIES.find((c) => issueLabels.includes(c));
    if (!category) continue;

    if (!counts[category]) {
      counts[category] = { total: 0, accepted: 0, rejected: 0, wontfix: 0 };
    }

    counts[category].total += 1;
    counts[category][classification] += 1;
  }

  /** @type {Record<string, { total: number, accepted: number, rejected: number, wontfix: number, rejection_rate: number }>} */
  const rates = {};
  for (const [category, data] of Object.entries(counts)) {
    rates[category] = {
      ...data,
      rejection_rate: data.total > 0 ? data.rejected / data.total : 0,
    };
  }

  return rates;
}

/**
 * Compute the issue budget for a category based on its rejection rate.
 * If rejection rate > REJECTION_THRESHOLD (40%), budget is halved.
 *
 * @param {string} category - Category name
 * @param {Record<string, { rejection_rate: number }>} rates - Per-category rates
 * @returns {number} Max issues allowed for this category per run
 */
export function computeIssueBudget(category, rates) {
  const data = rates[category];
  if (!data) {
    return DEFAULT_BUDGET_PER_CATEGORY;
  }

  if (data.rejection_rate > REJECTION_THRESHOLD) {
    return Math.floor(DEFAULT_BUDGET_PER_CATEGORY / 2);
  }

  return DEFAULT_BUDGET_PER_CATEGORY;
}

/**
 * Queries closed issues with AI-associated labels (last 90 days), returning
 * a result that distinguishes "the query ran and legitimately found nothing"
 * from "the query itself failed" (e.g. an auth failure in Claude Code Remote
 * sessions — #3937). Callers must not collapse both into the same "no data"
 * shape, or a query failure silently reads as an empty result.
 *
 * @param {(args: string[]) => unknown[]} listIssues  `gh issue list` (ghClient.issue.list)
 * @returns {{ ok: true, issues: object[] } | { ok: false, error: string }}
 */
export function queryClosedIssuesForFeedback(listIssues) {
  const labelQuery = CATEGORIES.map((c) => `label:${c}`).join(" ");
  try {
    const issues = listIssues([
      "--state",
      "closed",
      "--limit",
      "200",
      "--json",
      ISSUE_JSON_FIELDS,
      "--search",
      labelQuery,
    ]);
    return { ok: true, issues };
  } catch (err) {
    return { ok: false, error: describeGhError(err) };
  }
}

/**
 * Read the persisted feedback file.
 *
 * @returns {object | null}
 */
export function readFeedbackFile() {
  try {
    return read("ai-issue-feedback");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// CLI / main
// ---------------------------------------------------------------------------

const ghClient = createGhClient({ timeoutMs: 30_000 });

export async function run() {
  const args = process.argv.slice(2);
  const DRY_RUN = args.includes("--dry-run");
  const JSON_ONLY = args.includes("--json");

  // Query closed issues with AI-associated labels (last 90 days)
  const result = queryClosedIssuesForFeedback((queryArgs) => ghClient.issue.list(queryArgs));

  if (!result.ok) {
    // Persist the failure (not just log it) so the issueFeedback sensor can
    // read `error` and report the auth-capability gap distinctly from "not
    // yet collected" — a query failure must never look like empty data (#3937).
    const errorFeedback = { collected_at: new Date().toISOString(), error: result.error };
    if (JSON_ONLY) {
      process.stdout.write(JSON.stringify(errorFeedback, null, 2) + "\n");
    } else {
      console.error(`[collect-ai-issue-feedback] Query failed: ${result.error}`);
    }
    if (!DRY_RUN) {
      write("ai-issue-feedback", errorFeedback);
    }
    process.exit(1);
  }

  // gh issue list --json does not expose linked PRs; classify by stateReason only.
  // COMPLETED → wontfix (or accepted if we could detect merged PRs),
  // NOT_PLANNED → rejected.
  const issues = result.issues.map((issue) => ({ ...issue, linkedPrs: [] }));

  const rates = computeCategoryRates(issues);

  const now = new Date();
  const feedback = {
    collected_at: now.toISOString(),
    period_days: 90,
    categories: rates,
    budgets: Object.fromEntries(CATEGORIES.map((c) => [c, computeIssueBudget(c, rates)])),
  };

  if (JSON_ONLY) {
    process.stdout.write(JSON.stringify(feedback, null, 2) + "\n");
    return feedback;
  }

  if (!DRY_RUN) {
    write("ai-issue-feedback", feedback);
    console.log(`[collect-ai-issue-feedback] Written to: ${FEEDBACK_PATH}`);
  }

  console.log(`[collect-ai-issue-feedback] Collected ${now.toISOString().slice(0, 10)}`);
  for (const [category, data] of Object.entries(rates)) {
    const budget = computeIssueBudget(category, rates);
    console.log(
      `  ${category}: ${data.total} total, ${data.accepted} accepted, ` +
        `${data.rejected} rejected (${Math.round(data.rejection_rate * 100)}%), budget=${budget}`
    );
  }

  return feedback;
}

// Run when invoked directly (not imported by tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    process.stderr.write(`[collect-ai-issue-feedback] Error: ${err.message}\n`);
    process.exit(1);
  });
}
