#!/usr/bin/env node

/**
 * assert-vitest-ran.mjs — fail a CI step when a vitest JSON report shows the
 * targeted suites were skipped rather than executed (#5369).
 *
 * `describe.skipIf(!DATABASE_URL)` reports as a file-level PASS when its
 * guard is false: the summary line reads no differently from a real pass
 * (`success: true`, zero failures), and a `numPendingTests` count is the
 * only signal that nothing actually ran. That gap is exactly how the RLS
 * backstop's seven-part series (#5248-#5255, #5492) shipped and closed
 * green without ever exercising the suites that would have caught it — CI's
 * `test` job has no Postgres, so both real-DB suites silently no-op there.
 *
 * This is the CI-side tripwire: after running the suites with
 * `--reporter=json --outputFile=<path>`, this script reads that report and
 * fails closed on zero tests, any pending/skipped test, or any failure —
 * never trusting the run's own exit code or `success` field alone.
 *
 * Usage:
 *   node scripts/assert-vitest-ran.mjs <path-to-vitest-json-report>
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * @param {{numTotalTests?: number, numPassedTests?: number, numPendingTests?: number, numFailedTests?: number}} report
 * @returns {{ok: true, numTotalTests: number, numPassedTests: number} | {ok: false, reason: string}}
 */
export function assertSuitesRan(report) {
  const {
    numTotalTests = 0,
    numPassedTests = 0,
    numPendingTests = 0,
    numFailedTests = 0,
  } = report ?? {};

  if (numTotalTests === 0) {
    return { ok: false, reason: "vitest reported zero tests — the suite files were not collected" };
  }
  if (numPendingTests > 0) {
    return {
      ok: false,
      reason: `${numPendingTests} of ${numTotalTests} tests were skipped/pending, not executed — DATABASE_URL was likely unset or unreachable`,
    };
  }
  if (numFailedTests > 0 || numPassedTests !== numTotalTests) {
    return { ok: false, reason: `${numFailedTests} of ${numTotalTests} tests failed` };
  }

  return { ok: true, numTotalTests, numPassedTests };
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: node scripts/assert-vitest-ran.mjs <path-to-vitest-json-report>");
    process.exit(1);
  }

  const report = JSON.parse(readFileSync(path, "utf8"));
  const result = assertSuitesRan(report);

  if (!result.ok) {
    console.error(`::error::${result.reason}`);
    process.exit(1);
  }

  console.log(
    `Suites ran for real: ${result.numPassedTests}/${result.numTotalTests} tests passed, 0 skipped.`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
