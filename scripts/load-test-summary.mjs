#!/usr/bin/env node

/**
 * scripts/load-test-summary.mjs
 *
 * Derives real per-endpoint load-test status from k6's `--summary-export`
 * JSON output, and compares a run against a stored baseline.
 *
 * `.github/workflows/load-test.js` declares per-endpoint submetric
 * thresholds (e.g. `errors{endpoint:marketing_home}`,
 * `api_latency{endpoint:marketing_home}`). k6 reports each submetric's
 * pass/fail counts, p95, error rate, and threshold verdicts in the
 * exported summary — this module turns that into a "passed" / "failed" /
 * "not-run" status per endpoint instead of a hardcoded literal.
 *
 * Usage:
 *   node scripts/load-test-summary.mjs build <k6-summary.json> <date> <scenario> [output.json]
 *   node scripts/load-test-summary.mjs compare <current-results.json> <baseline-results.json>
 *
 * Exit code (build): 1 if the summary can't be parsed, or any endpoint's
 * thresholds were breached. 0 otherwise (including "not-run" endpoints).
 * Exit code (compare): always 0 — regressions are reported as warnings
 * (see LATENCY_REGRESSION_TOLERANCE / ERROR_RATE_REGRESSION_TOLERANCE).
 */
import fs from "node:fs";

/** Maps each results.json endpoint key to the k6 `endpoint:` tag value used in load-test.js. */
export const ENDPOINT_METRIC_TAGS = {
  marketing: "marketing_home",
  "users-api": "users_health",
  "reservations-api": "reservations_health",
  venues: "venues_list",
  availability: "availability_check",
  events: "events_list",
};

/** Allowed p95 latency increase over baseline before a regression is flagged. */
export const LATENCY_REGRESSION_TOLERANCE = 0.5; // 50%
/** Allowed absolute error-rate increase over baseline (0-1 scale) before a regression is flagged. */
export const ERROR_RATE_REGRESSION_TOLERANCE = 0.05; // 5 percentage points

/**
 * @typedef {{ status: "passed" | "failed" | "not-run", requests: number, p95: number | null, errorRate: number | null }} EndpointResult
 */

/**
 * Validate and extract the top-level `metrics` object from a k6
 * `--summary-export` JSON payload.
 * @param {unknown} json
 * @returns {Record<string, unknown>}
 */
export function parseK6SummaryMetrics(json) {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("Invalid k6 summary: expected a JSON object");
  }
  const { metrics } = /** @type {Record<string, unknown>} */ (json);
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
    throw new Error("Invalid k6 summary: missing top-level 'metrics' object");
  }
  return /** @type {Record<string, unknown>} */ (metrics);
}

/**
 * k6's `--summary-export` reports each threshold expression as a flat
 * boolean keyed by the expression string — e.g. `{ "rate<0.1": true }` —
 * where (confirmed against a live k6 run, see #3626 PR) `true` means the
 * threshold was **crossed** (breached), not that it passed.
 * @param {unknown} metric
 */
function metricThresholdCrossed(metric) {
  const thresholds = /** @type {{ thresholds?: Record<string, boolean> } | undefined} */ (metric)
    ?.thresholds;
  if (!thresholds) return false;
  return Object.values(thresholds).some((crossed) => crossed === true);
}

/**
 * Compute the status of a single endpoint from its `errors{endpoint:<tag>}`
 * and `api_latency{endpoint:<tag>}` submetrics. Both are flat k6 metric
 * objects (no `.values` wrapper): the Rate metric (`errors{...}`) carries
 * `passes`/`fails`/`value` directly, the Trend metric (`api_latency{...}`)
 * carries `p(95)` etc. directly.
 * @param {Record<string, unknown>} metrics
 * @param {string} tag
 * @returns {EndpointResult}
 */
export function computeEndpointStatus(metrics, tag) {
  const errorsMetric =
    /** @type {{ passes?: number, fails?: number, value?: number } | undefined} */ (
      metrics[`errors{endpoint:${tag}}`]
    );
  const latencyMetric = /** @type {Record<string, number> | undefined} */ (
    metrics[`api_latency{endpoint:${tag}}`]
  );

  if (!errorsMetric && !latencyMetric) {
    return { status: "not-run", requests: 0, p95: null, errorRate: null };
  }

  const passes = errorsMetric?.passes ?? 0;
  const fails = errorsMetric?.fails ?? 0;
  const requests = passes + fails;
  const p95 = latencyMetric?.["p(95)"] ?? null;
  const errorRate = errorsMetric?.value ?? null;

  if (requests === 0) {
    return { status: "not-run", requests: 0, p95, errorRate };
  }

  const breached = metricThresholdCrossed(errorsMetric) || metricThresholdCrossed(latencyMetric);
  return { status: breached ? "failed" : "passed", requests, p95, errorRate };
}

/**
 * Compute a status for every known endpoint from a full k6 summary JSON.
 * @param {unknown} summaryJson
 * @returns {Record<string, EndpointResult>}
 */
export function buildEndpointStatuses(summaryJson) {
  const metrics = parseK6SummaryMetrics(summaryJson);
  /** @type {Record<string, EndpointResult>} */
  const result = {};
  for (const [endpoint, tag] of Object.entries(ENDPOINT_METRIC_TAGS)) {
    result[endpoint] = computeEndpointStatus(metrics, tag);
  }
  return result;
}

/**
 * @param {Record<string, EndpointResult>} endpointStatuses
 * @returns {boolean}
 */
export function hasFailedEndpoint(endpointStatuses) {
  return Object.values(endpointStatuses).some((e) => e.status === "failed");
}

/**
 * @param {{ date: string, scenario: string, endpointStatuses: Record<string, EndpointResult> }} args
 */
export function buildResultsPayload({ date, scenario, endpointStatuses }) {
  return { date, scenario, endpoints: endpointStatuses };
}

/**
 * Compare current endpoint results against a stored baseline. Endpoints
 * missing from either side, or reporting "not-run", are skipped rather
 * than flagged — there is nothing meaningful to compare.
 * @param {Record<string, EndpointResult>} currentEndpoints
 * @param {Record<string, EndpointResult>} baselineEndpoints
 * @param {{ latencyTolerance?: number, errorRateTolerance?: number }} [tolerances]
 */
export function compareToBaseline(currentEndpoints, baselineEndpoints, tolerances = {}) {
  const {
    latencyTolerance = LATENCY_REGRESSION_TOLERANCE,
    errorRateTolerance = ERROR_RATE_REGRESSION_TOLERANCE,
  } = tolerances;

  const regressions = [];
  const skipped = [];

  for (const [endpoint, current] of Object.entries(currentEndpoints)) {
    const baseline = baselineEndpoints?.[endpoint];
    const comparable =
      baseline &&
      baseline.status !== "not-run" &&
      baseline.p95 != null &&
      current.status !== "not-run" &&
      current.p95 != null;

    if (!comparable) {
      skipped.push(endpoint);
      continue;
    }

    const latencyLimit = baseline.p95 * (1 + latencyTolerance);
    if (current.p95 > latencyLimit) {
      regressions.push({
        endpoint,
        metric: "p95",
        current: current.p95,
        baseline: baseline.p95,
        limit: latencyLimit,
      });
    }

    const errorRateLimit = (baseline.errorRate ?? 0) + errorRateTolerance;
    if ((current.errorRate ?? 0) > errorRateLimit) {
      regressions.push({
        endpoint,
        metric: "errorRate",
        current: current.errorRate,
        baseline: baseline.errorRate,
        limit: errorRateLimit,
      });
    }
  }

  return { regressions, skipped };
}

/**
 * Render a comparison result as a Markdown summary for the GH step summary.
 * @param {{ regressions: Array<{ endpoint: string, metric: string, current: number, baseline: number, limit: number }>, skipped: string[] }} comparison
 */
export function formatComparisonSummary(comparison) {
  const lines = ["## Load Test Comparison", ""];
  if (comparison.regressions.length === 0) {
    lines.push("No regressions detected beyond tolerance.");
  } else {
    lines.push(
      `⚠️ ${comparison.regressions.length} regression(s) detected (warn-only — does not fail the job):`
    );
    for (const r of comparison.regressions) {
      lines.push(
        `- **${r.endpoint}** ${r.metric}: ${r.current} vs baseline ${r.baseline} (limit ${r.limit.toFixed(2)})`
      );
    }
  }
  if (comparison.skipped.length > 0) {
    lines.push("", `Skipped (no baseline or not-run): ${comparison.skipped.join(", ")}`);
  }
  return lines.join("\n");
}

/** @param {string} text */
function appendStepSummary(text) {
  const outputFile = process.env.GITHUB_STEP_SUMMARY;
  if (!outputFile) return;
  fs.appendFileSync(outputFile, `${text}\n\n`);
}

/**
 * @param {string[]} args
 */
function runBuild(args) {
  const [summaryPath, date, scenario, outputPath = "results.json"] = args;
  if (!summaryPath || !date || !scenario) {
    console.error(
      "Usage: node scripts/load-test-summary.mjs build <k6-summary.json> <date> <scenario> [output.json]"
    );
    process.exit(1);
  }

  let endpointStatuses;
  try {
    const json = JSON.parse(fs.readFileSync(summaryPath, "utf-8"));
    endpointStatuses = buildEndpointStatuses(json);
  } catch (err) {
    console.error(`Failed to parse k6 summary at ${summaryPath}: ${err.message}`);
    endpointStatuses = Object.fromEntries(
      Object.keys(ENDPOINT_METRIC_TAGS).map((key) => [
        key,
        { status: "not-run", requests: 0, p95: null, errorRate: null },
      ])
    );
    fs.writeFileSync(
      outputPath,
      JSON.stringify(buildResultsPayload({ date, scenario, endpointStatuses }), null, 2)
    );
    appendStepSummary("## Load Test Results\n\nFailed to parse k6 summary — see job logs.");
    process.exit(1);
  }

  fs.writeFileSync(
    outputPath,
    JSON.stringify(buildResultsPayload({ date, scenario, endpointStatuses }), null, 2)
  );

  const summaryLines = [
    "## Load Test Results",
    "",
    `Scenario: ${scenario}`,
    "",
    "| Endpoint | Status | p95 (ms) | Error rate | Requests |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const [endpoint, result] of Object.entries(endpointStatuses)) {
    summaryLines.push(
      `| ${endpoint} | ${result.status} | ${result.p95 ?? "n/a"} | ${result.errorRate ?? "n/a"} | ${result.requests} |`
    );
  }
  const summaryText = summaryLines.join("\n");
  process.stdout.write(`${summaryText}\n`);
  appendStepSummary(summaryText);

  if (hasFailedEndpoint(endpointStatuses)) {
    console.error("One or more endpoints breached their k6 thresholds.");
    process.exit(1);
  }
}

/**
 * @param {string[]} args
 */
function runCompare(args) {
  const [currentPath, baselinePath] = args;
  if (!currentPath || !baselinePath) {
    console.error(
      "Usage: node scripts/load-test-summary.mjs compare <current-results.json> <baseline-results.json>"
    );
    process.exit(1);
  }

  let current;
  try {
    current = JSON.parse(fs.readFileSync(currentPath, "utf-8"));
  } catch (err) {
    console.error(`Failed to read current results at ${currentPath}: ${err.message}`);
    process.exit(1);
    return;
  }

  let baseline;
  try {
    baseline = JSON.parse(fs.readFileSync(baselinePath, "utf-8"));
  } catch {
    const text = "## Load Test Comparison\n\nNo baseline available — skipping comparison.";
    process.stdout.write(`${text}\n`);
    appendStepSummary(text);
    return;
  }

  const comparison = compareToBaseline(current.endpoints ?? {}, baseline.endpoints ?? {});
  const text = formatComparisonSummary(comparison);
  process.stdout.write(`${text}\n`);
  appendStepSummary(text);
}

function main() {
  const [, , cmd, ...args] = process.argv;
  if (cmd === "build") {
    runBuild(args);
  } else if (cmd === "compare") {
    runCompare(args);
  } else {
    console.error("Usage: node scripts/load-test-summary.mjs <build|compare> ...");
    process.exit(1);
  }
}

// Only run when executed directly, not when imported by tests
if (import.meta.url === new URL(process.argv[1], "file://").href) {
  main();
}
