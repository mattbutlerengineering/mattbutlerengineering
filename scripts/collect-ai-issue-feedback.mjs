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

import { execFile } from "node:child_process";
import { promisify } from "node:util";
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

  // gh (GraphQL) says NOT_PLANNED; the REST fallback says not_planned.
  if (String(issue.stateReason ?? "").toUpperCase() === "NOT_PLANNED") {
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
  // Comma list = OR. Space-separated `label:` qualifiers AND together and match
  // nothing (measured: 0 vs ~1.9k results, #6312).
  const labelQuery = `label:${CATEGORIES.join(",")}`;
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

const TIMELINE_PAGE_SIZE = 100;
const TIMELINE_MAX_PAGES = 5;
const DEFAULT_LINKED_PR_CONCURRENCY = 5;

/**
 * Merged PRs that closed an issue, from its REST timeline events. A merged
 * cross-reference only counts when the PR body carries a closing keyword for
 * this issue (a bare mention is not acceptance) — see
 * docs/fixes/ai-issue-feedback-accepted/design.md.
 *
 * @param {number} issueNumber
 * @param {object[]} events  `GET /repos/{o}/{r}/issues/{n}/timeline` events
 * @returns {{ number: number, state: "MERGED" }[]}
 */
export function extractLinkedPrs(issueNumber, events) {
  const closes = new RegExp(
    `\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s+#${issueNumber}\\b`,
    "i"
  );
  const prs = [];
  for (const event of events) {
    if (event.event !== "cross-referenced" || event.source?.type !== "issue") continue;
    const source = event.source.issue;
    if (!source?.pull_request?.merged_at) continue;
    if (!closes.test(source.body ?? "")) continue;
    prs.push({ number: source.number, state: "MERGED" });
  }
  return prs;
}

/**
 * Fetch linked merged PRs for many issues. Never throws: a failed lookup
 * yields `[]` for that issue and is counted, and a rate-limit error stops
 * all further API calls (remaining issues get `[]`, counted as failures).
 *
 * @param {number[]} issueNumbers
 * @param {(issueNumber: number, page: number) => Promise<object[]>} getTimeline
 * @param {{ concurrency?: number }} [opts]
 * @returns {Promise<{ linkedPrsByIssue: Map<number, object[]>, failures: number }>}
 */
export async function fetchLinkedPrsByIssue(issueNumbers, getTimeline, opts = {}) {
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_LINKED_PR_CONCURRENCY);
  const linkedPrsByIssue = new Map();
  let failures = 0;
  let throttled = false;
  let next = 0;

  const lookup = async (issueNumber) => {
    const prs = [];
    for (let page = 1; page <= TIMELINE_MAX_PAGES; page++) {
      const events = await getTimeline(issueNumber, page);
      prs.push(...extractLinkedPrs(issueNumber, events));
      if (prs.length > 0 || events.length < TIMELINE_PAGE_SIZE) break;
    }
    return prs;
  };

  const worker = async () => {
    while (next < issueNumbers.length) {
      const issueNumber = issueNumbers[next++];
      if (throttled) {
        linkedPrsByIssue.set(issueNumber, []);
        failures++;
        continue;
      }
      try {
        linkedPrsByIssue.set(issueNumber, await lookup(issueNumber));
      } catch (err) {
        if (/rate limit|abuse detection/i.test(describeGhError(err))) throttled = true;
        linkedPrsByIssue.set(issueNumber, []);
        failures++;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return { linkedPrsByIssue, failures };
}

const execFileAsync = promisify(execFile);
const DEFAULT_REPO = "mattbutlerengineering/mattbutlerengineering";

/**
 * Timeline fetcher over `gh api` (plain REST, so it works where GraphQL answers
 * 403). The exec seam is injectable for tests.
 *
 * @param {string} repo  `owner/name`
 * @param {(file: string, args: string[]) => Promise<{ stdout: string }>} [exec]
 * @returns {(issueNumber: number, page: number) => Promise<object[]>}
 */
export function createTimelineFetcher(repo = DEFAULT_REPO, exec = execFileAsync) {
  return async (issueNumber, page) => {
    const { stdout } = await exec("gh", [
      "api",
      `repos/${repo}/issues/${issueNumber}/timeline?per_page=${TIMELINE_PAGE_SIZE}&page=${page}`,
    ]);
    return JSON.parse(stdout);
  };
}

/**
 * Attach merged closing PRs to each issue so `classifyIssue` can report
 * `accepted`. A failed lookup leaves that issue with an empty linked-PR list and is
 * counted, never thrown.
 *
 * @param {object[]} issues
 * @param {(issueNumber: number, page: number) => Promise<object[]>} getTimeline
 * @returns {Promise<{ issues: object[], failures: number }>}
 */
export async function attachLinkedPrs(issues, getTimeline) {
  const { linkedPrsByIssue, failures } = await fetchLinkedPrsByIssue(
    issues.map((issue) => issue.number),
    getTimeline
  );
  return {
    issues: issues.map((issue) => ({
      ...issue,
      linkedPrs: linkedPrsByIssue.get(issue.number) ?? [],
    })),
    failures,
  };
}

/**
 * Warn when every category reports `accepted: 0` although merged closing PRs
 * were found, or when every linked-PR lookup failed — the shape the old
 * hardcoded-empty stub produced, which reads as a quiet period.
 *
 * @param {object[]} issues  issues after `attachLinkedPrs`
 * @param {Record<string, { accepted: number }>} rates
 * @param {number} failures  failed linked-PR lookups
 * @returns {string | null}
 */
export function acceptedGuardWarning(issues, rates, failures) {
  if (issues.length === 0) return null;
  if (Object.values(rates).some((r) => r.accepted > 0)) return null;
  if (failures >= issues.length) {
    return `all ${issues.length} linked-PR lookups failed; accepted is 0 everywhere because detection did not run`;
  }
  const merged = issues.reduce(
    (n, i) => n + (i.linkedPrs ?? []).filter((pr) => pr.state === "MERGED").length,
    0
  );
  if (merged > 0) {
    return `accepted is 0 in every category although ${merged} merged closing PR(s) were found`;
  }
  return null;
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

  // `gh issue list --json` exposes no linked PRs; look up the merged closing PR
  // per issue through the REST timeline.
  const { issues, failures } = await attachLinkedPrs(
    result.issues,
    createTimelineFetcher(process.env.GITHUB_REPOSITORY ?? DEFAULT_REPO)
  );
  if (failures > 0) {
    console.error(`[collect-ai-issue-feedback] ${failures} linked-PR lookup(s) failed`);
  }

  const rates = computeCategoryRates(issues);
  const guardWarning = acceptedGuardWarning(issues, rates, failures);
  if (guardWarning) {
    console.error(`[collect-ai-issue-feedback] WARNING: ${guardWarning}`);
  }

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
