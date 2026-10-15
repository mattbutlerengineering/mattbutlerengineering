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
 * Real `getIssueState` dep: reads one issue's state through a gh-client.
 *
 * A gh/network failure is "error" — NEVER "missing". "missing" means gh
 * affirmatively said the issue does not exist; conflating the two made every
 * transient blip file a duplicate issue (#6374).
 *
 * @param {{issue: {view: Function}}} ghClient
 * @param {number} issueNumber
 * @returns {"open"|"closed"|"missing"|"error"}
 */
export function issueState(ghClient, issueNumber) {
  try {
    const state = String(ghClient.issue.view(issueNumber, ["--json", "state"]).state).toLowerCase();
    return state === "open" ? "open" : state === "closed" ? "closed" : "error";
  } catch (err) {
    return isIssueNotFoundError(err) ? "missing" : "error";
  }
}

/** True when a gh failure affirmatively says the issue does not exist. */
export function isIssueNotFoundError(err) {
  const text = `${err?.message ?? ""} ${err?.stderr ?? ""}`;
  return /could not resolve to an issue|not found|\b404\b|no issue found/i.test(text);
}

/** Parses the issue number out of the URL `gh issue create` prints on success. */
export function parseIssueNumberFromUrl(url) {
  const match = String(url).match(/\/issues\/(\d+)\s*$/);
  if (!match) throw new Error(`gh issue create returned unexpected output: ${url}`);
  return parseInt(match[1], 10);
}

/**
 * @typedef {Object} IssueFilingRequest
 * @property {string} title
 * @property {string} body
 * @property {string[]} labels
 * @property {string} dedupeKey    stable key identifying "the same issue" across runs
 *
 * @typedef {Object} IssueFilingDeps
 * @property {(issueNumber: number) => "open"|"closed"|"vetoed"|"missing"|"error"} getIssueState
 * @property {(title: string, body: string, labels: string[]) => number} createIssue   returns the new issue number
 * @property {(issueNumber: number) => void} reopenIssue
 *
 * @typedef {"skip"|"create"|"reopen"|"skip-vetoed"|"skipped-error"} IssueFilingAction
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
 *   5. Ledger entry, state "vetoed" (Owner closed it as not planned, supplied by
 *      producers that can read stateReason) → "skip-vetoed": never reopen, never create.
 *   6. Ledger entry, state lookup errored      → "skipped-error": neither create nor
 *      reopen (the issue may well exist; creating would duplicate it), logged.
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

    if (state === "vetoed") {
      return { action: "skip-vetoed", issueNumber: prior, ledger };
    }

    if (state === "closed") {
      deps.reopenIssue(prior);
      return { action: "reopen", issueNumber: prior, ledger };
    }
    if (state === "error") {
      console.error(
        `fileIssue: could not read state of #${prior} for "${request.dedupeKey}" — skipping (no create/reopen)`
      );
      return { action: "skipped-error", issueNumber: prior, ledger };
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

/**
 * Search -> state -> create/reopen in one call, so a producer hands this
 * module a request plus a search spec instead of running its own finder and
 * building a one-entry ledger (#6414).
 *
 * A failed search fails OPEN (treated as "no prior found", the issue is
 * filed): a transient blip must not swallow a genuine finding. The failure is
 * surfaced through `onSearchError`.
 *
 * @param {IssueFilingRequest} request
 * @param {{
 *   search: () => Array<object>,
 *   match: (candidate: object) => boolean,
 *   onSearchError?: (err: Error) => void,
 * }} spec  `search` returns candidates in any state; `match` picks the prior
 * @param {IssueFilingDeps} deps
 * @returns {IssueFilingResult & {prior: object|null}}  `prior` is the matched candidate
 */
export function fileIssueBySearch(request, { search, match, onSearchError }, deps) {
  let candidates = [];
  try {
    const found = search();
    candidates = Array.isArray(found) ? found : [];
  } catch (err) {
    onSearchError?.(err);
  }
  const prior = candidates.find((candidate) => match(candidate)) ?? null;
  const ledger = prior ? { [request.dedupeKey]: prior.number } : {};
  return { ...fileIssue(request, ledger, deps), prior };
}

/**
 * The three `fileIssue` side effects backed by a gh-client: state read,
 * create (returns the new number), reopen.
 *
 * @param {{issue: {list: Function, view: Function, create: Function, reopen: Function}}} ghClient
 * @returns {IssueFilingDeps}
 */
export function ghIssueDeps(ghClient) {
  return {
    getIssueState: (issueNumber) => issueState(ghClient, issueNumber),
    createIssue: (title, body, labels) =>
      parseIssueNumberFromUrl(
        ghClient.issue.create([
          "--title",
          title,
          "--body",
          body,
          ...labels.flatMap((label) => ["--label", label]),
        ])
      ),
    reopenIssue: (issueNumber) => ghClient.issue.reopen(issueNumber),
  };
}

/**
 * `fileIssueBySearch` against a gh-client: `listArgs` are the `gh issue list`
 * args (search term / label / state / `--json` fields), passed through
 * unchanged so gh-client's REST fallback sees exactly what it did before.
 *
 * @param {{issue: {list: Function, view: Function, create: Function, reopen: Function}}} ghClient
 * @param {IssueFilingRequest} request
 * @param {{listArgs: string[], match: (candidate: object) => boolean, onSearchError?: (err: Error) => void}} spec
 */
export function fileIssueViaGhClient(ghClient, request, { listArgs, match, onSearchError }) {
  return fileIssueBySearch(
    request,
    { search: () => ghClient.issue.list(listArgs), match, onSearchError },
    ghIssueDeps(ghClient)
  );
}
