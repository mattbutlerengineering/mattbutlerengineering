/**
 * scripts/e2e-failure-rate.mjs
 *
 * Parses the Playwright JSON reporter output and computes the E2E failure rate.
 * When run on CI, writes `threshold_exceeded` and `failure_rate` to GITHUB_OUTPUT
 * so downstream steps can gate environment diagnostic capture.
 *
 * Usage: node scripts/e2e-failure-rate.mjs <path-to-playwright-results.json>
 *
 * Default threshold: 20% (per #1968 / #2737 recommendation).
 */
import fs from "node:fs";

const DEFAULT_THRESHOLD = 20;

/**
 * @typedef {{ expected: number, unexpected: number, flaky: number }} PlaywrightStats
 * @typedef {{ total: number, failed: number, rate: number }} FailureRate
 */

/**
 * Extract relevant stats from a Playwright JSON reporter result object.
 * @param {unknown} json - Parsed playwright results JSON
 * @returns {PlaywrightStats}
 */
export function parsePlaywrightResults(json) {
  if (
    !json ||
    typeof json !== "object" ||
    !("stats" in json) ||
    typeof json.stats !== "object" ||
    json.stats === null
  ) {
    throw new Error("Invalid Playwright results: missing top-level 'stats' field");
  }

  const {
    expected = 0,
    unexpected = 0,
    flaky = 0,
  } = /** @type {Record<string, number>} */ (json.stats);

  return { expected, unexpected, flaky };
}

/**
 * Compute failure rate from Playwright stats.
 * Skipped tests are excluded from the denominator — they did not run.
 * @param {PlaywrightStats} stats
 * @returns {FailureRate}
 */
export function computeFailureRate({ expected, unexpected, flaky }) {
  const total = expected + unexpected + flaky;
  if (total === 0) {
    return { total: 0, failed: 0, rate: 0 };
  }
  const rate = (unexpected / total) * 100;
  return { total, failed: unexpected, rate };
}

/**
 * Whether the failure rate strictly exceeds the threshold.
 * @param {number} rate - Computed failure rate (0–100)
 * @param {number} threshold - Threshold percentage (default: DEFAULT_THRESHOLD)
 * @returns {boolean}
 */
export function exceedsThreshold(rate, threshold = DEFAULT_THRESHOLD) {
  return rate > threshold;
}

function main() {
  const resultsPath = process.argv[2];
  if (!resultsPath) {
    console.error("Usage: node scripts/e2e-failure-rate.mjs <playwright-results.json>");
    process.exit(1);
  }

  if (!fs.existsSync(resultsPath)) {
    console.error(`Results file not found: ${resultsPath}`);
    // No results file means tests likely didn't run — treat as no failure
    writeOutputs(false, 0);
    return;
  }

  const json = JSON.parse(fs.readFileSync(resultsPath, "utf-8"));
  const stats = parsePlaywrightResults(json);
  const { total, failed, rate } = computeFailureRate(stats);
  const thresholdPct = Number(process.env.E2E_FAILURE_THRESHOLD ?? DEFAULT_THRESHOLD);
  const exceeded = exceedsThreshold(rate, thresholdPct);

  const rateFormatted = rate.toFixed(1);
  process.stdout.write(
    `E2E failure rate: ${rateFormatted}% (${failed}/${total}) — threshold: ${thresholdPct}% — exceeded: ${exceeded}\n`
  );

  writeOutputs(exceeded, rate);
}

/**
 * Write key=value pairs to GITHUB_OUTPUT when running in CI.
 * @param {boolean} exceeded
 * @param {number} rate
 */
function writeOutputs(exceeded, rate) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) return;
  fs.appendFileSync(outputFile, `threshold_exceeded=${exceeded}\n`);
  fs.appendFileSync(outputFile, `failure_rate=${rate.toFixed(1)}\n`);
}

// Only run when executed directly, not when imported by tests
if (import.meta.url === new URL(process.argv[1], "file://").href) {
  main();
}
