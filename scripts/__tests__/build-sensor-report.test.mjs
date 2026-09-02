import { describe, it, expect } from "vitest";
import { buildReport, formatSensorDisplay } from "../build-sensor-report.mjs";

const THRESHOLDS = {
  lighthouse_score_drop: 0.05,
  ci_pass_rate_drop: 5,
  code_churn_rate_max: 0.3,
  queue_efficiency_composite_drop: 0.05,
  queue_efficiency_fps_drop: 0.1,
};

const NOW = new Date("2026-07-01T12:00:00.000Z");

describe("buildReport", () => {
  it("is pure — never throws for a minimal all-unavailable sensor set and returns the expected shape", () => {
    const sensors = { acmm: { available: false } };
    const report = buildReport(sensors, undefined, THRESHOLDS, NOW);

    expect(report.generated_at).toBe(NOW.toISOString());
    expect(report.period).toEqual({ start: "2026-06-24", end: "2026-07-01" });
    expect(report.sensors).toBe(sensors);
    expect(report.thresholds).toBe(THRESHOLDS);
    expect(Array.isArray(report.regressions)).toBe(true);
    expect(report.summary.status).toBe("healthy");
  });

  it("counts sensors_available/sensors_total across only the report-participating registry entries", () => {
    const sensors = {
      acmm: { available: true, level: 5, criteria_met: 1, criteria_total: 2 },
    };
    const report = buildReport(sensors, undefined, THRESHOLDS, NOW);
    // acmm is available; every other report sensor is missing from `sensors` (undefined),
    // which counts as unavailable — but the total must equal the full report-sensor count.
    const totalReportSensors = report.summary.sensors_total;
    expect(totalReportSensors).toBeGreaterThan(1);
    expect(report.summary.sensors_available).toBe(1);
  });

  it("detects a ciHealth pass-rate-drop regression (lifted from the original if-block)", () => {
    const current = { ciHealth: { available: true, pass_rate_pct: 77, passed: 20, completed: 26 } };
    const previous = { ciHealth: { available: true, pass_rate_pct: 89 } };
    const report = buildReport(current, previous, THRESHOLDS, NOW);
    expect(report.regressions).toEqual([
      {
        sensor: "ciHealth",
        metric: "pass_rate_pct",
        current: 77,
        previous: 89,
        delta: -12,
        severity: "high",
      },
    ]);
    expect(report.summary.status).toBe("regressions_detected");
  });

  it("does not flag ciHealth when the drop is within threshold", () => {
    const current = { ciHealth: { available: true, pass_rate_pct: 88, passed: 22, completed: 25 } };
    const previous = { ciHealth: { available: true, pass_rate_pct: 89 } };
    const report = buildReport(current, previous, THRESHOLDS, NOW);
    expect(report.regressions).toEqual([]);
  });

  it("detects a lighthouse per-surface score-drop regression", () => {
    const current = {
      lighthouse: {
        available: true,
        scored_count: 1,
        surfaces: [{ url: "https://example.com/", scores: { performance: 0.7 } }],
      },
    };
    const previous = {
      lighthouse: {
        available: true,
        surfaces: [{ url: "https://example.com/", scores: { performance: 0.9 } }],
      },
    };
    const report = buildReport(current, previous, THRESHOLDS, NOW);
    expect(report.regressions).toEqual([
      {
        sensor: "lighthouse",
        metric: "https://example.com/:performance",
        current: 0.7,
        previous: 0.9,
        delta: -0.2,
        severity: "high",
      },
    ]);
  });

  it("detects an issues closure-rate regression when it drops below 50 from >= 50", () => {
    const current = {
      issues: { available: true, closure_rate: 40, created_7d: 10, closed_7d: 4, queue_depth: 3 },
    };
    const previous = { issues: { available: true, closure_rate: 60 } };
    const report = buildReport(current, previous, THRESHOLDS, NOW);
    expect(report.regressions).toEqual([
      {
        sensor: "issues",
        metric: "closure_rate",
        current: 40,
        previous: 60,
        delta: -20,
        severity: "medium",
      },
    ]);
  });

  it("detects a codeChurn threshold-exceeded regression even with no previous report", () => {
    const current = {
      codeChurn: {
        available: true,
        churn_rate: 0.4,
        lines_churned_7d: 400,
        total_lines_added_7d: 1000,
      },
    };
    const report = buildReport(current, undefined, THRESHOLDS, NOW);
    expect(report.regressions).toEqual([
      {
        sensor: "codeChurn",
        metric: "churn_rate",
        current: 0.4,
        previous: null,
        delta: null,
        severity: "medium",
      },
    ]);
  });

  it("propagates queueEfficiency's own internally-detected regressions", () => {
    const current = {
      queueEfficiency: {
        available: true,
        composite: 0.5,
        regressions: [
          {
            sensor: "queueEfficiency",
            metric: "first_pass_success_rate",
            current: 0.5,
            baseline: 0.8,
            delta: -0.3,
            severity: "high",
          },
        ],
      },
    };
    const report = buildReport(current, undefined, THRESHOLDS, NOW);
    expect(report.regressions).toHaveLength(1);
    expect(report.regressions[0].metric).toBe("first_pass_success_rate");
  });

  it("adds a composite_vs_previous_report regression when queueEfficiency drops vs the prior report", () => {
    const current = { queueEfficiency: { available: true, composite: 0.5, regressions: [] } };
    const previous = { queueEfficiency: { available: true, composite: 0.7 } };
    const report = buildReport(current, previous, THRESHOLDS, NOW);
    expect(report.regressions).toEqual([
      {
        sensor: "queueEfficiency",
        metric: "composite_vs_previous_report",
        current: 0.5,
        previous: 0.7,
        delta: -0.2,
        severity: "high",
      },
    ]);
  });
});

describe("formatSensorDisplay", () => {
  it("renders an 'available: false' line for missing/unavailable sensors", () => {
    const lines = formatSensorDisplay({});
    expect(lines.some((l) => l.startsWith("acmm: ⏭  not available"))).toBe(true);
  });

  it("renders the acmm line via its registry format function", () => {
    const lines = formatSensorDisplay({
      acmm: { available: true, level: 5, criteria_met: 95, criteria_total: 114 },
    });
    expect(lines).toContain("acmm: L5 (95/114 criteria)");
  });

  it("renders the ciHealth line under its reportKey (not the underlying id 'ci')", () => {
    const lines = formatSensorDisplay({
      ciHealth: { available: true, pass_rate_pct: 77, passed: 20, failed: 6, completed: 30 },
    });
    // #4713: format reports passed/(passed+failed), the same denominator
    // pass_rate_pct is computed over — not `completed` (which also folds in
    // skipped/cancelled runs).
    expect(lines).toContain("ciHealth: 77% pass rate (20/26)");
  });

  it("renders the agentCost line with its non-standard '(per-issue attribution)' phrasing", () => {
    const lines = formatSensorDisplay({
      agentCost: { available: true, spend_7d_usd: 2.36, spend_today_usd: 0, sessions_7d: 30 },
    });
    expect(lines).toContain(
      "agentCost (per-issue attribution): $2.36 (7d), $0 (today), 30 attributed sessions"
    );
  });

  // #3937: a query failure (e.g. GhAuthError in a Claude Code Remote session)
  // must render distinctly from a sensor that simply doesn't apply here —
  // both used to collapse to the identical "⏭  not available" line.
  it("renders a distinguishable 'query failed' line when a sensor collect() carries an error", () => {
    const lines = formatSensorDisplay({
      ciHealth: { available: false, error: "GitHub auth failed (401)" },
    });
    const ciHealthLine = lines.find((l) => l.startsWith("ciHealth:"));
    expect(ciHealthLine).toContain("query failed");
    expect(ciHealthLine).toContain("GitHub auth failed");
    expect(ciHealthLine).not.toContain("not available");
  });
});
