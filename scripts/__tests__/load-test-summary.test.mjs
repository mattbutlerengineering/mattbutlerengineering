import { describe, it, expect } from "vitest";
import {
  ENDPOINT_METRIC_TAGS,
  LATENCY_REGRESSION_TOLERANCE,
  ERROR_RATE_REGRESSION_TOLERANCE,
  parseK6SummaryMetrics,
  computeEndpointStatus,
  buildEndpointStatuses,
  buildResultsPayload,
  hasFailedEndpoint,
  compareToBaseline,
  formatComparisonSummary,
} from "../load-test-summary.mjs";

/**
 * Builds a k6 `--summary-export` style JSON summary with per-endpoint
 * submetrics (`errors{endpoint:<tag>}` / `api_latency{endpoint:<tag>}`).
 * Verified against a live k6 run (see #3626 PR): each metric object is
 * flat (no `.values` wrapper) and `thresholds` maps an expression string
 * to a boolean that is `true` when the threshold was CROSSED (breached),
 * not when it passed. `passes`/`fails` on the `errors{...}` Rate metric
 * count `errorRate.add(true)` / `.add(false)` calls respectively — i.e.
 * `passes` counts *errors*, not successes.
 */
function makeEndpointMetric({ tag, passes, fails, p95, crossed = false }) {
  const total = passes + fails;
  return {
    [`errors{endpoint:${tag}}`]: {
      passes,
      fails,
      value: total > 0 ? passes / total : 0,
      thresholds: { "rate<0.1": crossed },
    },
    [`api_latency{endpoint:${tag}}`]: {
      avg: p95 * 0.6,
      min: 1,
      med: p95 * 0.5,
      max: p95 * 1.5,
      "p(90)": p95 * 0.9,
      "p(95)": p95,
      thresholds: { "p(95)<1500": crossed },
    },
  };
}

function makeAllPassingSummary() {
  const metrics = {};
  for (const tag of Object.values(ENDPOINT_METRIC_TAGS)) {
    // passes=0 errors, fails=30 non-errors — a clean run.
    Object.assign(metrics, makeEndpointMetric({ tag, passes: 0, fails: 30, p95: 200 }));
  }
  return { metrics };
}

describe("parseK6SummaryMetrics", () => {
  it("returns the metrics object from a valid summary", () => {
    const summary = makeAllPassingSummary();
    expect(parseK6SummaryMetrics(summary)).toBe(summary.metrics);
  });

  it("throws on a non-object input", () => {
    expect(() => parseK6SummaryMetrics(null)).toThrow(/invalid k6 summary/i);
    expect(() => parseK6SummaryMetrics("not json")).toThrow(/invalid k6 summary/i);
    expect(() => parseK6SummaryMetrics([1, 2, 3])).toThrow(/invalid k6 summary/i);
  });

  it("throws when the top-level 'metrics' field is missing", () => {
    expect(() => parseK6SummaryMetrics({})).toThrow(/missing top-level 'metrics'/i);
  });

  it("throws when 'metrics' is not an object", () => {
    expect(() => parseK6SummaryMetrics({ metrics: "oops" })).toThrow(
      /missing top-level 'metrics'/i
    );
  });
});

describe("computeEndpointStatus", () => {
  it("reports 'passed' when the endpoint's thresholds are all ok", () => {
    const summary = makeAllPassingSummary();
    const result = computeEndpointStatus(summary.metrics, "marketing_home");
    expect(result.status).toBe("passed");
    expect(result.requests).toBe(30);
    expect(result.p95).toBe(200);
    expect(result.errorRate).toBe(0);
  });

  it("reports 'failed' when a threshold on the endpoint is breached", () => {
    const metrics = makeEndpointMetric({
      tag: "users_health",
      passes: 25,
      fails: 5,
      p95: 900,
      crossed: true,
    });
    const result = computeEndpointStatus(metrics, "users_health");
    expect(result.status).toBe("failed");
    expect(result.requests).toBe(30);
  });

  it("reports 'not-run' when the endpoint has no submetrics in the summary", () => {
    const summary = makeAllPassingSummary();
    const result = computeEndpointStatus(summary.metrics, "endpoint_never_hit");
    expect(result.status).toBe("not-run");
    expect(result.requests).toBe(0);
    expect(result.p95).toBeNull();
    expect(result.errorRate).toBeNull();
  });

  it("reports 'not-run' when the endpoint's submetrics exist but have zero requests", () => {
    const metrics = makeEndpointMetric({ tag: "venues_list", passes: 0, fails: 0, p95: 0 });
    const result = computeEndpointStatus(metrics, "venues_list");
    expect(result.status).toBe("not-run");
    expect(result.requests).toBe(0);
  });

  // Regression test: a live k6 run against this workflow (see #3626 PR) proved
  // the real --summary-export shape is flat (no `.values` wrapper) and that
  // `thresholds[expr]` is `true` when CROSSED, not when passed — the opposite
  // of the initial assumption. Uses a literal excerpt of that run's summary.json.
  it("matches the real k6 --summary-export shape (excerpt from a live run)", () => {
    const liveExcerpt = {
      "errors{endpoint:marketing_home}": {
        passes: 0,
        fails: 11192,
        thresholds: { "rate<0.1": false },
        value: 0,
      },
      "api_latency{endpoint:marketing_home}": {
        avg: 29.91,
        min: 17.71,
        med: 28.13,
        max: 131.0,
        "p(90)": 38.48,
        "p(95)": 42.74,
        thresholds: { "p(95)<3000": false },
      },
      "errors{endpoint:reservations_health}": {
        passes: 11032,
        fails: 160,
        thresholds: { "rate<0.1": true },
        value: 0.9857040743388135,
      },
      "api_latency{endpoint:reservations_health}": {
        avg: 694.86,
        min: 24.13,
        med: 156.73,
        max: 32987.93,
        "p(90)": 602.87,
        "p(95)": 1250.49,
        thresholds: { "p(95)<800": true },
      },
    };

    const marketing = computeEndpointStatus(liveExcerpt, "marketing_home");
    expect(marketing).toEqual({ status: "passed", requests: 11192, p95: 42.74, errorRate: 0 });

    const reservations = computeEndpointStatus(liveExcerpt, "reservations_health");
    expect(reservations.status).toBe("failed");
    expect(reservations.requests).toBe(11192);
    expect(reservations.errorRate).toBeCloseTo(0.9857, 3);
  });
});

describe("buildEndpointStatuses", () => {
  it("computes a status for every known endpoint", () => {
    const summary = makeAllPassingSummary();
    const statuses = buildEndpointStatuses(summary);
    expect(Object.keys(statuses).sort()).toEqual(Object.keys(ENDPOINT_METRIC_TAGS).sort());
    for (const result of Object.values(statuses)) {
      expect(result.status).toBe("passed");
    }
  });

  it("marks an endpoint absent from the summary as 'not-run' without touching the others", () => {
    const summary = makeAllPassingSummary();
    delete summary.metrics["errors{endpoint:events_list}"];
    delete summary.metrics["api_latency{endpoint:events_list}"];

    const statuses = buildEndpointStatuses(summary);
    expect(statuses.events.status).toBe("not-run");
    expect(statuses.marketing.status).toBe("passed");
  });

  it("throws a clear error for a malformed summary", () => {
    expect(() => buildEndpointStatuses({ not: "a summary" })).toThrow(
      /missing top-level 'metrics'/i
    );
  });
});

describe("hasFailedEndpoint", () => {
  it("is false when every endpoint passed or was not run", () => {
    expect(
      hasFailedEndpoint({
        marketing: { status: "passed" },
        venues: { status: "not-run" },
      })
    ).toBe(false);
  });

  it("is true when any endpoint failed", () => {
    expect(
      hasFailedEndpoint({
        marketing: { status: "passed" },
        "users-api": { status: "failed" },
      })
    ).toBe(true);
  });
});

describe("buildResultsPayload", () => {
  it("assembles date, scenario, and per-endpoint statuses", () => {
    const endpointStatuses = {
      marketing: { status: "passed", p95: 200, errorRate: 0, requests: 30 },
    };
    const payload = buildResultsPayload({ date: "2026-08-02", scenario: "load", endpointStatuses });
    expect(payload).toEqual({
      date: "2026-08-02",
      scenario: "load",
      endpoints: endpointStatuses,
    });
  });
});

describe("compareToBaseline", () => {
  const baseline = {
    marketing: { status: "passed", p95: 200, errorRate: 0, requests: 30 },
    "users-api": { status: "passed", p95: 100, errorRate: 0, requests: 30 },
  };

  it("reports no regressions when current is within tolerance of baseline", () => {
    const current = {
      marketing: { status: "passed", p95: 210, errorRate: 0, requests: 30 },
      "users-api": { status: "passed", p95: 120, errorRate: 0, requests: 30 },
    };
    const result = compareToBaseline(current, baseline);
    expect(result.regressions).toEqual([]);
  });

  it("flags a p95 latency regression beyond the tolerance", () => {
    const current = {
      marketing: { status: "passed", p95: 500, errorRate: 0, requests: 30 }, // 200 * 1.5 tolerance = 300 limit
      "users-api": { status: "passed", p95: 100, errorRate: 0, requests: 30 },
    };
    const result = compareToBaseline(current, baseline);
    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0]).toMatchObject({ endpoint: "marketing", metric: "p95" });
  });

  it("flags an error-rate regression beyond the tolerance", () => {
    const current = {
      marketing: { status: "passed", p95: 200, errorRate: 0, requests: 30 },
      "users-api": { status: "failed", p95: 100, errorRate: 0.2, requests: 30 }, // baseline 0 + 0.05 tolerance
    };
    const result = compareToBaseline(current, baseline);
    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0]).toMatchObject({ endpoint: "users-api", metric: "errorRate" });
  });

  it("skips an endpoint missing from the baseline instead of flagging a regression", () => {
    const current = { events: { status: "passed", p95: 9999, errorRate: 0, requests: 30 } };
    const result = compareToBaseline(current, baseline);
    expect(result.regressions).toEqual([]);
    expect(result.skipped).toContain("events");
  });

  it("skips a not-run endpoint on either side", () => {
    const current = { marketing: { status: "not-run", p95: null, errorRate: null, requests: 0 } };
    const result = compareToBaseline(current, baseline);
    expect(result.regressions).toEqual([]);
    expect(result.skipped).toContain("marketing");
  });

  it("honors custom tolerances", () => {
    const current = { marketing: { status: "passed", p95: 250, errorRate: 0, requests: 30 } };
    const strict = compareToBaseline(current, baseline, { latencyTolerance: 0.1 });
    expect(strict.regressions).toHaveLength(1);
  });

  it("uses the documented default tolerances", () => {
    expect(LATENCY_REGRESSION_TOLERANCE).toBeGreaterThan(0);
    expect(ERROR_RATE_REGRESSION_TOLERANCE).toBeGreaterThan(0);
  });
});

describe("formatComparisonSummary", () => {
  it("reports a clean bill when there are no regressions", () => {
    const text = formatComparisonSummary({ regressions: [], skipped: [] });
    expect(text).toMatch(/no regressions/i);
  });

  it("lists each regression with current, baseline, and limit", () => {
    const text = formatComparisonSummary({
      regressions: [
        { endpoint: "marketing", metric: "p95", current: 500, baseline: 200, limit: 300 },
      ],
      skipped: [],
    });
    expect(text).toMatch(/marketing/);
    expect(text).toMatch(/p95/);
    expect(text).toMatch(/500/);
  });

  it("lists skipped endpoints", () => {
    const text = formatComparisonSummary({ regressions: [], skipped: ["events"] });
    expect(text).toMatch(/events/);
  });
});
