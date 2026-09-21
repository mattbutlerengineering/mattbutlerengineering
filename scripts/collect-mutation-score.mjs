import { classifyMutationRun } from "./classify-mutation-run.mjs";

/**
 * Pure collector for mutation testing score from a Stryker mutation report.
 *
 * Reads and computes the mutation score from a parsed Stryker JSON report
 * (reports/mutation/mutation.json). The Stryker v9 JSON format follows the
 * mutation-testing-report-schema; it does NOT include a top-level `metrics`
 * field — that field is computed by mutation-testing-elements (the HTML viewer).
 * This collector replicates that computation from the per-file mutant statuses.
 *
 * The caller (sensor-report.mjs) is responsible for reading and parsing the
 * JSON file; this function receives the parsed object so it can be tested
 * with a fixture without any filesystem access.
 *
 * Returns `{ available: false, state }` when the run produced no usable
 * measurement, where `state` comes from classifyMutationRun():
 *   - `report-missing` — reportJson is null / undefined / has no `files`
 *   - `report-empty`   — no gradeable mutants (report format unrecognised, or
 *                        everything was Ignored / NoCoverage)
 *   - `harness-broken` — the run executed no tests, so every mutant trivially
 *                        survived (#5614). This is NOT a 0% score; see
 *                        classify-mutation-run.mjs for why the distinction is
 *                        load-bearing.
 *
 * Stryker report schema: https://github.com/stryker-mutator/mutation-testing-elements/tree/master/packages/report-schema
 *
 * Score formula (matches mutation-testing-elements):
 *   mutationScore = killed / (killed + survived + timeout) * 100
 *   NoCoverage and Ignored mutants are excluded from the denominator.
 *
 * @param {object|null|undefined} reportJson - Parsed Stryker mutation.json content.
 * @param {Date} [now] - Reference timestamp (injectable for tests; defaults to current time).
 * @returns {object} Sensor-compatible metrics or { available: false }.
 */
export function collectMutationScore(reportJson, now = new Date()) {
  // Gate on what the run actually measured BEFORE computing a score. A report
  // whose harness ran zero tests yields a mathematically valid 0% that means
  // nothing — the guard has to come first or the number escapes (#5614).
  const state = classifyMutationRun(reportJson);
  if (state !== "scored") {
    return { available: false, state };
  }

  const files = Object.values(reportJson.files);

  // Aggregate mutant counts across all files.
  let killed = 0;
  let survived = 0;
  let timeout = 0;
  let noCoverage = 0;
  let ignored = 0;

  for (const file of files) {
    for (const mutant of file.mutants ?? []) {
      switch (mutant.status) {
        case "Killed":
          killed++;
          break;
        case "Survived":
          survived++;
          break;
        case "Timeout":
          timeout++;
          break;
        case "NoCoverage":
          noCoverage++;
          break;
        case "Ignored":
          ignored++;
          break;
        // RuntimeError, CompileError, etc. are excluded like Ignored
      }
    }
  }

  // Denominator: only Killed + Survived + Timeout count toward the score.
  // classifyMutationRun() already rejected the zero-denominator case as
  // `report-empty`, so this is non-zero by construction.
  const denominator = killed + survived + timeout;

  const rawScore = (killed / denominator) * 100;
  const roundedScore = Math.round(rawScore * 100) / 100;

  // Threshold comes from the report's thresholds.high field (default 80).
  const threshold = reportJson.thresholds?.high ?? 80;

  return {
    available: true,
    state,
    mutation_score: roundedScore,
    passes_threshold: roundedScore >= threshold,
    threshold,
    killed,
    survived,
    timeout,
    no_coverage: noCoverage,
    total_mutants: killed + survived + timeout + noCoverage + ignored,
    last_run: now.toISOString(),
  };
}

/**
 * Extracts Survived mutants (the actionable ones — a real behavior change
 * no test caught) with their file/line/mutator, for surfacing "what to fix
 * next" in reports. Order follows the report's own file/mutant iteration
 * order; callers wanting a specific priority should sort before slicing.
 *
 * @param {object|null|undefined} reportJson - Parsed Stryker mutation.json content.
 * @param {number} [limit] - Max mutants to return (default 5).
 * @returns {Array<{file: string, line: number, mutator: string}>}
 */
export function collectTopSurvivedMutants(reportJson, limit = 5) {
  if (!reportJson?.files) {
    return [];
  }

  const survived = [];
  for (const [file, fileResult] of Object.entries(reportJson.files)) {
    for (const mutant of fileResult.mutants ?? []) {
      if (mutant.status === "Survived") {
        survived.push({
          file,
          line: mutant.location?.start?.line ?? 0,
          mutator: mutant.mutatorName,
        });
      }
    }
  }

  return survived.slice(0, limit);
}
