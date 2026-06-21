/**
 * Pure collector for flaky-test detection.
 *
 * A test is "flaky" when it both passes AND fails on the SAME commit SHA
 * (unchanged code) within a recent window.
 *
 * CURRENT STATE: No per-test pass/fail history is stored in this repo today.
 * CI runs vitest with the default stdout reporter — no JUnit XML, no
 * --outputFile, and no artifact upload for per-test results. This collector
 * returns { available: false, data_gap: "..." } until that infrastructure is
 * enabled.
 *
 * See: docs/flaky-test-detection-findings.md for the full spike findings and
 * the costed recommendation to enable per-test history.
 *
 * Input shape (for future use once history exists):
 *   Array<{
 *     sha: string,       // commit SHA the test ran against
 *     testName: string,  // fully-qualified test name (e.g. "suite > test case")
 *     passed: boolean,   // outcome of this specific run
 *   }>
 *
 * Output shape:
 *   { available: false, data_gap: string }
 *   OR
 *   {
 *     available: true,
 *     flaky_count: number,
 *     flaky_tests: Array<{ testName: string, sha: string, passCount: number, failCount: number }>,
 *     total_runs: number,
 *     window_shas: number,
 *   }
 */

/**
 * Detect flaky tests from per-test run history.
 *
 * @param {Array<{ sha: string, testName: string, passed: boolean }> | null} runs
 * @returns {object}
 */
export function computeFlakyTests(runs) {
  if (!runs || runs.length === 0) {
    return {
      available: false,
      data_gap:
        "No per-test run history found. Enable JUnit reporter and artifact upload in CI — " +
        "see docs/flaky-test-detection-findings.md for the costed recommendation.",
    };
  }

  // Group outcomes by (testName, sha) key.
  // Key: `${sha}::${testName}` → { passCount, failCount }
  /** @type {Map<string, { testName: string, sha: string, passCount: number, failCount: number }>} */
  const groups = new Map();

  for (const run of runs) {
    const key = `${run.sha}::${run.testName}`;
    const existing = groups.get(key) ?? {
      testName: run.testName,
      sha: run.sha,
      passCount: 0,
      failCount: 0,
    };
    const updated = run.passed
      ? { ...existing, passCount: existing.passCount + 1 }
      : { ...existing, failCount: existing.failCount + 1 };
    groups.set(key, updated);
  }

  // A test-SHA pair is flaky when it has at least one pass AND at least one fail.
  const flakyEntries = [...groups.values()].filter((g) => g.passCount > 0 && g.failCount > 0);

  const uniqueShas = new Set(runs.map((r) => r.sha)).size;

  return {
    available: true,
    flaky_count: flakyEntries.length,
    flaky_tests: flakyEntries,
    total_runs: runs.length,
    window_shas: uniqueShas,
  };
}
