import { describe, it, expect } from "vitest";
import { buildReviewCoverageTrail } from "../collect-queue-efficiency.mjs";
import { SENSORS } from "../sensors-registry.mjs";

// #8185: pins the #8184 review_coverage trend detector against the incident
// sequence recorded verbatim in metrics/process-metrics.jsonl. review_coverage
// fell 0.286 -> 0.211 -> 0.167 over three days while the composite only moved
// 0.918 -> 0.914 -> 0.910, and every report logged regression_count 0.
const INCIDENT_ROWS = [
  {
    date: "2026-10-28",
    sensor: "queueEfficiency",
    available: true,
    composite: 0.918,
    sub_metrics: {
      issues_merged: 114,
      first_pass_success_rate: 0.877,
      median_time_to_merge_hours: 0.2,
      median_rework_cycles: 0,
      cost_per_issue_usd: null,
      cost_coverage_n: 0,
      review_coverage: 0.286,
      review_coverage_n: 21,
    },
    regression_count: 0,
  },
  {
    date: "2026-10-29",
    sensor: "queueEfficiency",
    available: true,
    composite: 0.914,
    sub_metrics: {
      issues_merged: 101,
      first_pass_success_rate: 0.871,
      median_time_to_merge_hours: 0.2,
      median_rework_cycles: 0,
      cost_per_issue_usd: null,
      cost_coverage_n: 0,
      review_coverage: 0.211,
      review_coverage_n: 19,
    },
    regression_count: 0,
  },
  {
    date: "2026-10-30",
    sensor: "queueEfficiency",
    available: true,
    composite: 0.91,
    sub_metrics: {
      issues_merged: 89,
      first_pass_success_rate: 0.865,
      median_time_to_merge_hours: 0.3,
      median_rework_cycles: 0,
      cost_per_issue_usd: null,
      cost_coverage_n: 0,
      review_coverage: 0.167,
      review_coverage_n: 18,
    },
    regression_count: 0,
  },
];

const sensor = () => SENSORS.find((s) => s.id === "queueEfficiency");

/**
 * Runs the real detector for `todayRow`, building its trail from `historyRows`
 * exactly as the sensor's `collect` does, and comparing against `previousRow`.
 */
function detect(historyRows, todayRow, previousRow) {
  const trail = buildReviewCoverageTrail(historyRows, todayRow.sub_metrics, todayRow.date);
  return sensor().detectRegression(
    {
      ...todayRow,
      sub_metrics: { ...todayRow.sub_metrics, review_coverage_trail: trail },
      regressions: [],
    },
    previousRow,
    sensor().thresholds
  );
}

function withCoverage(row, review_coverage, review_coverage_n) {
  return {
    ...row,
    sub_metrics: { ...row.sub_metrics, review_coverage, review_coverage_n },
  };
}

const byMetric = (regs, metric) => regs.filter((r) => r.metric === metric);

describe("queueEfficiency review_coverage trend — incident fixture (#8185)", () => {
  const [day1, day2, day3] = INCIDENT_ROWS;

  it("the incident sequence produces exactly one review_coverage_trend regression", () => {
    const regs = detect([day1, day2], day3, day2);
    expect(regs).toHaveLength(1);
    expect(regs[0]).toMatchObject({
      sensor: "queueEfficiency",
      metric: "review_coverage_trend",
      current: 0.167,
      previous: 0.286,
      delta: -0.119,
    });
  });

  it("the incident's composite movement alone stays below the composite threshold", () => {
    const regs = detect([day1, day2], day3, day2);
    expect(byMetric(regs, "composite_vs_previous_report")).toEqual([]);
  });

  it("a composite-only drop is still detected, with no review_coverage_trend", () => {
    const flat = [day1, day2].map((r) => withCoverage(r, 0.25, 20));
    const today = { ...withCoverage(day3, 0.25, 20), composite: 0.8 };
    const regs = detect(flat, today, flat[1]);
    expect(byMetric(regs, "composite_vs_previous_report")).toHaveLength(1);
    expect(byMetric(regs, "review_coverage_trend")).toEqual([]);
  });

  it("a recovery sequence (0.167 -> 0.25) is not flagged", () => {
    const recovery = { ...withCoverage(day3, 0.25, 20), date: "2026-10-31" };
    const regs = detect([day1, day2, day3], recovery, day3);
    expect(byMetric(regs, "review_coverage_trend")).toEqual([]);
  });

  it("the same decline with n below the sample floor is not flagged", () => {
    const sparse = withCoverage(day2, 0.211, 14);
    const regs = detect([day1, sparse], day3, sparse);
    expect(byMetric(regs, "review_coverage_trend")).toEqual([]);
  });
});
