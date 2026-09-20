/**
 * Completion-sweep decision for `nightly-compliance.yml` (#5454).
 *
 * `#5084` fixed duplicate-filing by keying the filed issue on a stable
 * failure signature instead of the date, so a persistent failure gets one
 * issue instead of a fresh one every night. But nothing ever closed an
 * *older* issue once a newer run's failure set showed it had been
 * superseded (e.g. one of its failures got fixed, or the remaining
 * failures are now fully covered by the newest issue) — so the backlog of
 * `[nightly-compliance ...]` issues only ever grew, even while individual
 * root causes were being fixed elsewhere.
 *
 * `isSupersededByNewRun()` decides, from report content alone (no GitHub
 * I/O), whether an older issue's recorded failures are a subset of (or
 * equal to) the newest run's failures — i.e. nothing in the older issue is
 * new or unique anymore. `planSweep()` applies that decision across a batch
 * of candidate issues.
 */

import { computeNormalizedFailureSet } from "./nightly-compliance-signature.mjs";

/**
 * @param {string} oldReport   an older nightly-compliance issue's body (or
 *   raw report.md) — the marker/date/wrapper text around it is irrelevant,
 *   only the `- ✗ ...` failure markers are read.
 * @param {string} newReport   the current run's report.md
 * @returns {boolean} true when the older report's failure set is non-empty
 *   and every entry in it also appears in the new run's failure set.
 */
export function isSupersededByNewRun(oldReport, newReport) {
  const oldChecks = computeNormalizedFailureSet(oldReport);
  if (oldChecks.length === 0) return false;

  const newChecks = new Set(computeNormalizedFailureSet(newReport));
  return oldChecks.every((check) => newChecks.has(check));
}

/**
 * @typedef {{ number: number, body: string }} CandidateIssue
 */

/**
 * Pure: given a batch of open nightly-compliance issues (the current run's
 * own issue already excluded by the caller) and this run's report, returns
 * the numbers of the issues that are superseded and safe to close.
 *
 * @param {CandidateIssue[]} candidates
 * @param {string} newReport
 * @returns {number[]}
 */
export function planSweep(candidates, newReport) {
  return candidates
    .filter((issue) => isSupersededByNewRun(issue.body, newReport))
    .map((issue) => issue.number);
}
