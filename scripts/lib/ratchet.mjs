/**
 * Shared "did it get worse?" ratchet core (ADR-018 "Detect" stage).
 *
 * One comparator + one deduped issue filer, generalized from the sensors
 * registry's per-sensor `detectRegression(current, previous, thresholds)`
 * shape. `acmm-regression-check.mjs` and `check-ai-antipatterns.mjs` are
 * adapters: each supplies its own current/baseline metric maps and calls
 * `compare()`; neither re-implements the comparison or the open-issue
 * dedupe check itself.
 */

/**
 * @typedef {{ metric: string, current: number, baseline: number, delta: number, severity: string }} Regression
 */

const SEVERITY_RANK = { high: 2, medium: 1, low: 0 };

/**
 * Default severity mapper: "high" once the delta magnitude passes 2x the
 * threshold, "medium" otherwise.
 *
 * @param {number} delta
 * @param {number} threshold
 * @returns {string}
 */
function defaultSeverityFor(delta, threshold) {
  return threshold > 0 && Math.abs(delta) > threshold * 2 ? "high" : "medium";
}

/** @param {Regression[]} regressions */
function highestSeverity(regressions) {
  return regressions.reduce(
    (worst, r) =>
      (SEVERITY_RANK[r.severity] ?? 0) > (SEVERITY_RANK[worst] ?? 0) ? r.severity : worst,
    regressions[0].severity
  );
}

/**
 * Compares a map of current metric values against a baseline map and
 * reports which metrics regressed.
 *
 * A metric regresses when its delta (current - baseline) crosses
 * `threshold` in the direction that means "worse":
 *   - direction "decrease" (default): regressed when delta < -threshold (value fell)
 *   - direction "increase": regressed when delta > threshold (value rose)
 *
 * A nullish `baseline` (no prior data yet — first run) never regresses,
 * matching every existing sensor's "no previous data" behaviour. A present
 * baseline object with a metric key missing defaults that metric's baseline
 * value to 0, so a brand-new metric appearing with a non-zero/worse value
 * still counts as a regression.
 *
 * @param {Record<string, number>} current
 * @param {Record<string, number> | null | undefined} baseline
 * @param {object} [opts]
 * @param {"increase"|"decrease"} [opts.direction="decrease"]
 * @param {number} [opts.threshold=0] - minimum |delta| to count as a regression
 * @param {(delta: number, threshold: number) => string} [opts.severityFor] - overrides the default severity mapper
 * @returns {{ regressions: Regression[], severity: string | null }}
 */
export function compare(current, baseline, opts = {}) {
  if (!baseline) return { regressions: [], severity: null };

  const direction = opts.direction ?? "decrease";
  const threshold = opts.threshold ?? 0;
  const severityFor = opts.severityFor ?? defaultSeverityFor;

  const regressions = Object.entries(current)
    .map(([metric, value]) => {
      const baselineValue = baseline[metric] ?? 0;
      const delta = value - baselineValue;
      const regressed = direction === "increase" ? delta > threshold : delta < -threshold;
      return regressed
        ? {
            metric,
            current: value,
            baseline: baselineValue,
            delta,
            severity: severityFor(delta, threshold),
          }
        : null;
    })
    .filter(Boolean);

  return {
    regressions,
    severity: regressions.length > 0 ? highestSeverity(regressions) : null,
  };
}

// ---------------------------------------------------------------------------
// Deduped issue filer — shared by any adapter that opens a GitHub issue for a
// detected regression (only the ACMM adapter today; the shape generalizes).
//
// Routes the skip/create/reopen decision through the shared `fileIssue()`
// seam (#3775) instead of hand-rolling it. Search strategy is unchanged
// (label + marker-in-body); the only behavioral change is that the search
// now covers every state (not just open), so a rerun after the prior
// regression issue was closed reopens it instead of filing a duplicate.
// ---------------------------------------------------------------------------

import { fileIssue } from "./issue-filing.mjs";

/**
 * Lazily loads @mbe/gh-client and returns a fresh client. Kept out of the
 * module top-level so scripts that only import compare() (e.g. the
 * check-ai-antipatterns.mjs count/ratchet mode) never resolve gh-client's
 * dist — the CI antipattern-ratchet job runs that script with no build step.
 *
 * @returns {Promise<import("@mbe/gh-client").GhClient>}
 */
async function defaultGhClient() {
  const { createGhClient } = await import("@mbe/gh-client");
  return createGhClient();
}

/**
 * Pure: finds a prior regression issue (any state) among candidates whose
 * body carries `marker`. Feeds `fileIssue()`'s dedupe-by-ledger decision: a
 * match lets a rerun skip (still open) or reopen (previously closed)
 * instead of filing a duplicate.
 *
 * @param {Array<{ number: number, body?: string }>} candidates
 * @param {string} marker
 * @returns {number | null}
 */
export function findPriorRegressionIssue(candidates, marker) {
  const match = (candidates ?? []).find(
    (issue) => typeof issue?.body === "string" && issue.body.includes(marker)
  );
  return match ? match.number : null;
}

/**
 * Fetches issues for a label (any state, so a previously-closed regression
 * issue can be found and reopened) via the injected `ghClient`.
 *
 * @param {string} label
 * @param {import("@mbe/gh-client").GhClient} ghClient
 * @returns {Array<{ number: number, body: string, state: string }>}
 */
export function fetchIssuesByLabel(label, ghClient) {
  const issues = ghClient.issue.list([
    "--label",
    label,
    "--state",
    "all",
    "--limit",
    "100",
    "--json",
    "number,body,state",
  ]);
  return Array.isArray(issues) ? issues : [];
}

/** Real `getIssueState` dep for `fileIssue()`, backed by `gh issue view`. */
function getIssueStateViaGhClient(ghClient, issueNumber) {
  try {
    const state = String(ghClient.issue.view(issueNumber, ["--json", "state"]).state).toLowerCase();
    return state === "open" ? "open" : state === "closed" ? "closed" : "missing";
  } catch {
    return "missing";
  }
}

/** Parses the issue number out of the URL `gh issue create` prints on success. */
function parseIssueNumberFromUrl(url) {
  const match = url.match(/\/issues\/(\d+)\s*$/);
  if (!match) throw new Error(`gh issue create returned unexpected output: ${url}`);
  return parseInt(match[1], 10);
}

/**
 * Files a regression issue unless one is already open for `marker` (or
 * reopens it if previously closed) — the one issue-filing entry point every
 * regression adapter calls.
 *
 * @param {object} opts
 * @param {string} opts.label - issue label to scope the issue search to
 * @param {string} opts.marker - dedupe marker expected in the issue body
 * @param {{ title: string, body: string, labels: string[] }} opts.payload
 * @param {import("@mbe/gh-client").GhClient} [opts.ghClient]
 * @returns {Promise<{ filed: boolean, reason?: string, action?: string }>}
 */
export async function fileRegressionIssueIfNew({ label, marker, payload, ghClient }) {
  const client = ghClient ?? (await defaultGhClient());

  // A failed search must not swallow a genuine regression — fail open (treat
  // as "no prior found", file the issue) rather than closed.
  let candidates = [];
  try {
    candidates = fetchIssuesByLabel(label, client);
  } catch (err) {
    console.error(`[ratchet] search failed, proceeding as no-match: ${err.message}`);
  }
  const priorNumber = findPriorRegressionIssue(candidates, marker);
  const ledger = priorNumber !== null ? { [marker]: priorNumber } : {};

  const result = fileIssue(
    { title: payload.title, body: payload.body, labels: payload.labels, dedupeKey: marker },
    ledger,
    {
      getIssueState: (issueNumber) => getIssueStateViaGhClient(client, issueNumber),
      createIssue: (title, body, labels) =>
        parseIssueNumberFromUrl(
          client.issue.create(["--title", title, "--body", body, "--label", labels.join(",")])
        ),
      reopenIssue: (issueNumber) => client.issue.reopen(issueNumber),
    }
  );

  if (result.action === "skip") {
    return { filed: false, reason: "duplicate" };
  }
  return { filed: true, action: result.action };
}
