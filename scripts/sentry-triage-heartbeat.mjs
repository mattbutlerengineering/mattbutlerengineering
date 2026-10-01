/**
 * sentry-triage-heartbeat.mjs — the triage classification step, with the
 * daily Sentry heartbeat's own synthetic issues dropped first.
 *
 * Browser heartbeats group into one Sentry issue (measured 2026-10-01:
 * HOSPITALITY-B), so its event count clears triage's threshold within days.
 * Without this filter, triage would file a `ready` GitHub issue asking an
 * agent to "fix" the heartbeat. Dropped issues are counted as `heartbeat=N`
 * in the skip tally, so the filter is visible rather than silent.
 */

import { isHeartbeatIssue } from "./sentry-heartbeat.mjs";
import { classifySentryIssueActionability } from "./sentry-triage-recency.mjs";

/**
 * @param {Array<object>} issues Sentry issues (project-issues endpoint shape)
 * @param {{ severityThreshold: number, period: string }} options
 * @returns {Array<object & { actionable: boolean, reason: string, eventsInWindow: number | null }>}
 */
export function classifyTriageIssues(issues, options) {
  return issues.map((issue) => ({
    ...issue,
    ...(isHeartbeatIssue(issue)
      ? { actionable: false, reason: "heartbeat", eventsInWindow: null }
      : classifySentryIssueActionability(issue, options)),
  }));
}

/**
 * `reason=N, …` for every non-actionable issue; `none` when there are none.
 *
 * @param {Array<{ actionable: boolean, reason: string }>} classified
 * @returns {string}
 */
export function renderSkipTally(classified) {
  const counts = {};
  for (const issue of classified) {
    if (!issue.actionable) counts[issue.reason] = (counts[issue.reason] || 0) + 1;
  }
  const tally = Object.entries(counts)
    .map(([reason, count]) => `${reason}=${count}`)
    .join(", ");
  return tally || "none";
}
