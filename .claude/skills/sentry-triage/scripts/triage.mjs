#!/usr/bin/env node
import { classifySentryIssueActionability } from "../../../../scripts/sentry-triage-recency.mjs";
import { decideSentryDedup } from "../../../../scripts/sentry-triage-dedup.mjs";

const SENTRY_TOKEN = process.env.SENTRY_ACCESS_TOKEN;
if (!SENTRY_TOKEN) {
  console.error("SENTRY_ACCESS_TOKEN not set");
  process.exit(1);
}
const GITHUB_TOKEN = process.env.GH_TOKEN || "";
const ORG_SLUG = "mattbutlerengineering";
const REPO = "mattbutlerengineering/mattbutlerengineering";
const SEVERITY_THRESHOLD = 5;
/**
 * Triage window. Used for BOTH the Sentry query's `statsPeriod` and the
 * recency classification, so the two can never drift — the defect behind
 * #5534/#5535 was a query that said "14d" paired with a filter that
 * silently read the lifetime event total instead.
 */
const STATS_PERIOD = "14d";

async function sentryApi(endpoint) {
  const response = await fetch(`https://sentry.io/api/0${endpoint}`, {
    headers: { Authorization: `Bearer ${SENTRY_TOKEN}` },
  });
  if (!response.ok) throw new Error(`Sentry API error: ${response.status}`);
  return response.json();
}

async function ghApi(endpoint, options = {}) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      ...options.headers,
    },
  });
  return response.json();
}

/**
 * The search this dedup depends on. Omitting `state:` is how the Search API
 * spells "any state" — #5553: restricting it to `state:open` is exactly what
 * let a closed duplicate go unnoticed and get re-filed four times.
 *
 * Do NOT add `state:all` here. It is not a Search API qualifier (`state=all`
 * belongs to the REST *list* endpoint, which is the easy confusion), and the
 * API does not reject it — it silently matches nothing. Measured on this repo:
 * this query returns **17**; the same query plus `state:all` returns **0**,
 * HTTP 200, no error. A dedup fed zero rows reports "no existing issue" and
 * files the duplicate it exists to prevent. `sentry-triage-query.test.mjs`
 * pins the qualifier for that reason.
 */
export const SENTRY_ISSUE_SEARCH_QUERY = `repo:${REPO}+is:issue+label:sentry`;

/**
 * Fetches every existing `sentry`-labeled GitHub issue to dedup against.
 *
 * Returns `null` — never `[]` — on any failure, so a broken search can never
 * be mistaken for "no existing issues found"; see sentry-triage-dedup.mjs's
 * fail-closed contract. A *truncated* search counts as a failure for the same
 * reason: the Search API caps a page at 100, this query spans all history and
 * so only grows, and a silently dropped older match fails in the file-a-
 * duplicate direction — the exact direction of the bug being fixed.
 */
async function fetchExistingSentryIssues() {
  try {
    const result = await ghApi(`/search/issues?q=${SENTRY_ISSUE_SEARCH_QUERY}&per_page=100`);
    if (!Array.isArray(result.items)) return null;
    if (typeof result.total_count === "number" && result.total_count > result.items.length) {
      return null;
    }
    return result.items.map((item) => ({
      number: item.number,
      state: item.state,
      body: item.body ?? "",
    }));
  } catch {
    return null;
  }
}

async function createIssue(title, body, labels) {
  return ghApi(`/repos/${REPO}/issues`, {
    method: "POST",
    body: JSON.stringify({ title, body, labels }),
  });
}

async function triage() {
  console.log("Fetching Sentry projects...\n");
  const projects = await sentryApi(`/organizations/${ORG_SLUG}/projects/`);
  console.log(`Found ${projects.length} projects: ${projects.map((p) => p.slug).join(", ")}`);

  const allIssues = [];
  for (const project of projects) {
    const issues = await sentryApi(
      `/projects/${ORG_SLUG}/${project.slug}/issues/?statsPeriod=${STATS_PERIOD}`
    );
    allIssues.push(...issues.map((i) => ({ ...i, project: project.slug })));
  }

  console.log(`\nTotal issues: ${allIssues.length}`);

  // Classify on events INSIDE the window, not the lifetime `count`. A
  // long-dead issue keeps its lifetime total forever, which is how two
  // already-fixed errors were re-filed as #5534 and #5535 — 17 and 18 days
  // after their last event.
  const classified = allIssues.map((issue) => ({
    ...issue,
    ...classifySentryIssueActionability(issue, {
      severityThreshold: SEVERITY_THRESHOLD,
      period: STATS_PERIOD,
    }),
  }));

  const filtered = classified.filter((i) => i.actionable);

  const skipCounts = {};
  for (const i of classified) {
    if (!i.actionable) skipCounts[i.reason] = (skipCounts[i.reason] || 0) + 1;
  }
  const skipSummary = Object.entries(skipCounts)
    .map(([reason, n]) => `${reason}=${n}`)
    .join(", ");
  // Printed even when empty: a silent skip tally is how a payload-shape
  // change (everything -> `window-unknown`) would look identical to a
  // genuinely quiet day.
  console.log(`Not actionable: ${skipSummary || "none"}`);
  console.log(
    `Actionable (>=${SEVERITY_THRESHOLD} events in last ${STATS_PERIOD}): ${filtered.length}\n`
  );

  if (filtered.length === 0) {
    console.log("No actionable issues found. System is healthy!");
    return { created: 0, skipped: 0, found: 0 };
  }

  // Fetched once per run, not once per candidate — the dedup search result
  // doesn't change mid-run, and a null (search-unavailable) result must
  // fail every candidate closed, not just the first one that hits it.
  const existingSentryIssues = await fetchExistingSentryIssues();

  let created = 0,
    skipped = 0;
  for (const issue of filtered.slice(0, 3)) {
    const title = issue.title.slice(0, 100);
    const decision = decideSentryDedup(String(issue.id), existingSentryIssues);
    if (decision.action === "skip") {
      const matched = decision.matchedIssue ? `, matches #${decision.matchedIssue}` : "";
      console.log(`Skipping Sentry issue ${issue.id} (${decision.reason}${matched})`);
      skipped++;
      continue;
    }

    const body = `## Sentry Production Error\n\n**Sentry Issue:** https://sentry.io/organizations/${ORG_SLUG}/issues/${issue.id}/\n**Project:** ${issue.project}\n**Level:** ${issue.level}\n**Events:** ${issue.eventsInWindow} in last ${STATS_PERIOD} (${issue.count} lifetime)\n**Affected Users:** ${issue.userCount || 0}\n\n## Acceptance Criteria\n\n- [ ] Error rate drops >50% after fix\n- [ ] Verified by learning-loop post-fix check\n\n_Detected by sentry-triage_`;

    const result = await createIssue(`fix(${issue.project}): ${title}`, body, [
      "ready",
      "sentry",
      "bug",
    ]);
    console.log(`Created issue #${result.number}`);
    created++;
  }
  return { created, skipped, found: filtered.length };
}

triage()
  .then((r) =>
    console.log(`\nTriage complete: ${r.created} created, ${r.skipped} skipped of ${r.found} found`)
  )
  .catch((e) => {
    console.error("Error:", e.message);
    process.exit(1);
  });
