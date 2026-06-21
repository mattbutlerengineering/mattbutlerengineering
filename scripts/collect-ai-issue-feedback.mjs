#!/usr/bin/env node

/**
 * Collect accept/reject/wontfix rates for AI-created issues by category.
 *
 * Queries GitHub for closed issues with AI-associated labels,
 * classifies each as accepted (merged PR), rejected (closed without merge),
 * or wontfix, and stores per-category rates in metrics/ai-issue-feedback.json.
 *
 * Usage:
 *   node scripts/collect-ai-issue-feedback.mjs              # collect and persist
 *   node scripts/collect-ai-issue-feedback.mjs --dry-run    # print only
 *   node scripts/collect-ai-issue-feedback.mjs --json       # output raw JSON to stdout
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGhClient } from "@mbe/gh-client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const FEEDBACK_PATH = resolve(ROOT, "metrics", "ai-issue-feedback.json");

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
 * Read the persisted feedback file.
 *
 * @returns {object | null}
 */
export function readFeedbackFile() {
  try {
    return JSON.parse(readFileSync(FEEDBACK_PATH, "utf-8"));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// CLI / main
// ---------------------------------------------------------------------------

const ghClient = createGhClient({ timeoutMs: 30_000 });

function safe(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export async function run() {
  const args = process.argv.slice(2);
  const DRY_RUN = args.includes("--dry-run");
  const JSON_ONLY = args.includes("--json");

  // Query closed issues with AI-associated labels (last 90 days)
  const labelQuery = CATEGORIES.map((c) => `label:${c}`).join(" ");
  const issuesRaw = safe(
    () =>
      ghClient.issue.list([
        "--state",
        "closed",
        "--limit",
        "200",
        "--json",
        ISSUE_JSON_FIELDS,
        "--search",
        labelQuery,
      ]),
    null
  );

  if (!issuesRaw) {
    const error = { error: "Failed to query GitHub issues" };
    if (JSON_ONLY) {
      process.stdout.write(JSON.stringify(error, null, 2) + "\n");
    } else {
      console.error("[collect-ai-issue-feedback] Failed to query GitHub issues");
    }
    process.exit(1);
  }

  // gh issue list --json does not expose linked PRs; classify by stateReason only.
  // COMPLETED → wontfix (or accepted if we could detect merged PRs),
  // NOT_PLANNED → rejected.
  const issues = issuesRaw.map((issue) => ({ ...issue, linkedPrs: [] }));

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
    mkdirSync(dirname(FEEDBACK_PATH), { recursive: true });
    writeFileSync(FEEDBACK_PATH, JSON.stringify(feedback, null, 2) + "\n");
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
