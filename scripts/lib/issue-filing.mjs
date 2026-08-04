/**
 * Single issue-filing decision: skip / create / reopen.
 *
 * Sixteen places in this repo open GitHub issues, and each restates the same
 * "have I already filed this?" question in its own dialect — a ledger
 * lookup, a title search, a label+marker search — sometimes with no dedupe
 * at all. This module is the one place that owns the decision.
 *
 * `fileIssue()` is a pure function of (request, ledger) plus injected side
 * effects (`deps`), so it is testable with zero network calls. Producers
 * keep owning *how* they talk to GitHub (gh CLI, REST, gh-client) — they
 * just hand this module the three operations it needs.
 */

/**
 * @typedef {Object} IssueFilingRequest
 * @property {string} title
 * @property {string} body
 * @property {string[]} labels
 * @property {string} dedupeKey    stable key identifying "the same issue" across runs
 *
 * @typedef {Object} IssueFilingDeps
 * @property {(issueNumber: number) => "open"|"closed"|"missing"} getIssueState
 * @property {(title: string, body: string, labels: string[]) => number} createIssue   returns the new issue number
 * @property {(issueNumber: number) => void} reopenIssue
 *
 * @typedef {"skip"|"create"|"reopen"} IssueFilingAction
 *
 * @typedef {Object} IssueFilingResult
 * @property {IssueFilingAction} action
 * @property {number} issueNumber
 * @property {Record<string, number>} ledger   updated dedupeKey → issue number map
 */

/**
 * Decide and execute skip/create/reopen for one issue-filing request.
 *
 * Dedup rules, keyed by `request.dedupeKey` against `ledger`:
 *   1. No ledger entry                        → create, record in ledger.
 *   2. Ledger entry, issue currently open      → skip (don't spam).
 *   3. Ledger entry, issue currently closed    → reopen the existing issue (no dupe).
 *   4. Ledger entry, issue missing (deleted)   → create fresh, overwrite ledger entry.
 *
 * @param {IssueFilingRequest} request
 * @param {Record<string, number>} ledger
 * @param {IssueFilingDeps} deps
 * @returns {IssueFilingResult}
 */
export function fileIssue(request, ledger, deps) {
  const prior = ledger[request.dedupeKey];

  if (prior !== undefined) {
    const state = deps.getIssueState(prior);

    if (state === "open") {
      return { action: "skip", issueNumber: prior, ledger };
    }

    if (state === "closed") {
      deps.reopenIssue(prior);
      return { action: "reopen", issueNumber: prior, ledger };
    }
    // "missing" — the issue no longer exists (e.g. deleted); fall through to create.
  }

  const issueNumber = deps.createIssue(request.title, request.body, request.labels);
  return {
    action: "create",
    issueNumber,
    ledger: { ...ledger, [request.dedupeKey]: issueNumber },
  };
}
