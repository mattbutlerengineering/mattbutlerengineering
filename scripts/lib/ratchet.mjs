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
// ---------------------------------------------------------------------------

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
 * True when any OPEN issue's body already carries the given marker —
 * prevents filing duplicate regression issues.
 *
 * @param {Array<{ state: string, body?: string }>} issues
 * @param {string} marker
 * @returns {boolean}
 */
export function hasOpenRegressionIssue(issues, marker) {
  return issues.some(
    (issue) =>
      issue.state === "open" && typeof issue.body === "string" && issue.body.includes(marker)
  );
}

/**
 * Fetches open issues for a label via the injected `ghClient`.
 *
 * @param {string} label
 * @param {import("@mbe/gh-client").GhClient} ghClient
 * @returns {Array<{ number: number, body: string, state: string }>}
 */
export function fetchOpenIssuesByLabel(label, ghClient) {
  const issues = ghClient.issue.list([
    "--label",
    label,
    "--state",
    "open",
    "--limit",
    "100",
    "--json",
    "number,body,state",
  ]);
  return Array.isArray(issues) ? issues : [];
}

/**
 * Creates a GitHub issue via the injected `ghClient`.
 *
 * @param {{ title: string, body: string, labels: string[] }} payload
 * @param {import("@mbe/gh-client").GhClient} ghClient
 */
export function createIssue(payload, ghClient) {
  ghClient.issue.create([
    "--title",
    payload.title,
    "--body",
    payload.body,
    "--label",
    payload.labels.join(","),
  ]);
}

/**
 * Files a regression issue unless an open issue with the same marker already
 * exists — the one issue-filing entry point every regression adapter calls.
 *
 * @param {object} opts
 * @param {string} opts.label - issue label to scope the open-issue search to
 * @param {string} opts.marker - dedupe marker expected in the issue body
 * @param {{ title: string, body: string, labels: string[] }} opts.payload
 * @param {import("@mbe/gh-client").GhClient} [opts.ghClient]
 * @returns {Promise<{ filed: boolean, reason?: string }>}
 */
export async function fileRegressionIssueIfNew({ label, marker, payload, ghClient }) {
  const client = ghClient ?? (await defaultGhClient());
  const openIssues = fetchOpenIssuesByLabel(label, client);
  if (hasOpenRegressionIssue(openIssues, marker)) {
    return { filed: false, reason: "duplicate" };
  }
  createIssue(payload, client);
  return { filed: true };
}
