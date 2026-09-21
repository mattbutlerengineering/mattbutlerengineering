/**
 * classify-mutation-run.mjs — classify what a Stryker mutation.json actually
 * MEASURED, so "the harness ran nothing" can never be reported as "your tests
 * killed nothing" (#5614).
 *
 * The trap this module closes is narrower than "no report". `collectMutationScore`
 * already guarded the missing/unparseable case. What it could not see is a
 * report that is complete, parseable, schema-valid, and semantically void:
 * every graded mutant `Survived`, every one of them carrying
 * `testsCompleted: 0`. Stryker grades a mutant `Survived` when no test failed
 * — and if no test *ran*, none failed, so a harness that executes zero tests
 * per mutant produces a perfect, confident 0%.
 *
 * Measured on scheduled run 35622179696 (2026-09-21): 101 graded mutants, 101
 * `Survived`, 0 `Killed`, and `testsCompleted: 0` on all 101 — while the same
 * run's Stryker dry run reported `Ran 138 tests` and the report's own
 * `coveredBy` claimed 14-68 tests covered each mutant. A mutant covered by 68
 * tests that completed 0 of them is not a test-quality signal; it is a broken
 * measurement. Confirmed by hand: applying mutant 0 (`BlockStatement` ->
 * `{}` on services/users/src/routes/health.ts) to the source and running the
 * suite fails 5/5 health tests, so the mutant Stryker called "Survived" is in
 * fact trivially killable.
 *
 * Why this matters more than the wrong number: the workflow filed issue #5614
 * telling a reader to "add tests to kill surviving mutants". Acting on that is
 * expensive and useless — the tests already kill them. A false 0% is strictly
 * worse than no measurement, because a missing report prompts investigation
 * while a plausible-looking score prompts months of misdirected work. Same
 * family as `classifyCiGateStatus`'s `gate-missing` (an absent check reading as
 * green) and `classifyBuildFreshness`'s `unknown` — an absence that renders
 * identically to a fine result.
 *
 * States, none of which can be conflated with another:
 *   - `report-missing`  — no report, unparseable, or no `files` key at all.
 *   - `report-empty`    — a report with no gradeable mutants (nothing to score).
 *   - `harness-broken`  — gradeable mutants exist, but the run demonstrably
 *                         executed no tests against them. NOT a score.
 *   - `scored`          — a real measurement; the score means what it says.
 *
 * Deliberate asymmetry in the `harness-broken` test: a single `Killed` or
 * `Timeout` mutant is positive proof the harness ran and observed a failing
 * test, so any report containing one is `scored` regardless of what
 * `testsCompleted` says. `harness-broken` is only reachable when the score
 * would be exactly 0% anyway, which means this classifier can never mask,
 * lower, or otherwise alter a non-zero score — it only refuses to dress a
 * zero-evidence run up as a 0% result.
 *
 * `testsCompleted` is optional in the mutation-testing-report schema, so the
 * check is `> 0` rather than `=== 0`: a graded mutant that reports no positive
 * completed-test count is treated as having run nothing. For a report with at
 * least one kill that is unreachable (short-circuited above), and for an
 * all-survived report the conservative reading is the correct one — an
 * all-survived run that cannot evidence a single executed test should be
 * investigated, not published as a score.
 */

/** Mutant statuses that count toward the mutation score's denominator. */
const GRADED_STATUSES = new Set(["Killed", "Survived", "Timeout"]);

/** Statuses that prove the harness ran tests and observed a failure. */
const KILL_STATUSES = new Set(["Killed", "Timeout"]);

/**
 * @typedef {"report-missing" | "report-empty" | "harness-broken" | "scored"} MutationRunState
 */

/**
 * Classifies what a parsed Stryker mutation report actually measured.
 *
 * @param {object|null|undefined} reportJson - Parsed mutation.json content.
 * @returns {MutationRunState}
 */
export function classifyMutationRun(reportJson) {
  if (!reportJson || !reportJson.files) {
    return "report-missing";
  }

  const graded = Object.values(reportJson.files)
    .flatMap((file) => file?.mutants ?? [])
    .filter((mutant) => GRADED_STATUSES.has(mutant?.status));

  if (graded.length === 0) {
    return "report-empty";
  }

  if (graded.some((mutant) => KILL_STATUSES.has(mutant.status))) {
    return "scored";
  }

  const ranAnyTest = graded.some((mutant) => mutant.testsCompleted > 0);
  return ranAnyTest ? "scored" : "harness-broken";
}
