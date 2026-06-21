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
 * Returns `{ available: false }` when:
 *   - reportJson is null / undefined (no report generated yet)
 *   - reportJson.files is missing or empty (report format unrecognised)
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
  if (!reportJson || !reportJson.files) {
    return { available: false };
  }

  const files = Object.values(reportJson.files);
  if (files.length === 0) {
    return { available: false };
  }

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
  const denominator = killed + survived + timeout;
  if (denominator === 0) {
    return { available: false };
  }

  const rawScore = (killed / denominator) * 100;
  const roundedScore = Math.round(rawScore * 100) / 100;

  // Threshold comes from the report's thresholds.high field (default 80).
  const threshold = reportJson.thresholds?.high ?? 80;

  return {
    available: true,
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
