import { describe, it, expect } from "vitest";
import { correlate } from "../sensor-correlator.mjs";

const now = new Date().toISOString();
const hourAgo = new Date(Date.now() - 3600_000).toISOString();
const twoDaysAgo = new Date(Date.now() - 2 * 86400_000).toISOString();

describe("correlate", () => {
  it("returns empty array for empty regressions", () => {
    const result = correlate({ regressions: [] }, []);
    expect(result).toEqual([]);
  });

  it("returns empty array for undefined regressions", () => {
    const result = correlate({}, []);
    expect(result).toEqual([]);
  });

  it("groups perf-related signals in same timeframe", () => {
    const report = {
      regressions: [
        {
          sensor: "lighthouse",
          metric: "performance",
          current: 0.7,
          previous: 0.9,
          delta: -0.2,
          severity: "high",
          timestamp: now,
        },
        {
          sensor: "sentry",
          metric: "timeout_rate",
          current: 15,
          previous: 2,
          delta: 13,
          severity: "high",
          timestamp: hourAgo,
        },
      ],
    };
    const result = correlate(report, []);
    expect(result.length).toBe(1);
    expect(result[0].signals.length).toBe(2);
    expect(result[0].rootCause.length).toBeGreaterThan(0);
  });

  it("groups availability-related signals together", () => {
    const report = {
      regressions: [
        {
          sensor: "sentry",
          metric: "error_rate",
          current: 50,
          previous: 5,
          delta: 45,
          severity: "critical",
          timestamp: now,
        },
        {
          sensor: "ci",
          metric: "pass_rate",
          current: 60,
          previous: 100,
          delta: -40,
          severity: "high",
          timestamp: hourAgo,
        },
      ],
    };
    const result = correlate(report, []);
    expect(result.length).toBe(1);
    expect(result[0].signals.length).toBe(2);
    expect(result[0].severity).toBe("critical");
  });

  it("keeps non-overlapping signals independent", () => {
    const report = {
      regressions: [
        {
          sensor: "lighthouse",
          metric: "performance",
          current: 0.7,
          previous: 0.9,
          delta: -0.2,
          severity: "high",
          timestamp: now,
        },
        {
          sensor: "acmm",
          metric: "criteria_count",
          current: 50,
          previous: 55,
          delta: -5,
          severity: "medium",
          timestamp: twoDaysAgo,
        },
      ],
    };
    const result = correlate(report, []);
    expect(result.length).toBe(2);
    expect(result[0].signals.length).toBe(1);
    expect(result[1].signals.length).toBe(1);
  });

  it("deduplicates against open issues by sensor+metric", () => {
    const report = {
      regressions: [
        {
          sensor: "lighthouse",
          metric: "performance",
          current: 0.7,
          previous: 0.9,
          delta: -0.2,
          severity: "high",
          timestamp: now,
        },
        {
          sensor: "ci",
          metric: "pass_rate",
          current: 80,
          previous: 100,
          delta: -20,
          severity: "high",
          timestamp: now,
        },
      ],
    };
    const openIssues = [
      {
        number: 100,
        title: "fix(lighthouse): performance regressed (-0.15)",
        labels: [{ name: "audit" }],
      },
    ];
    const result = correlate(report, openIssues);
    expect(result.length).toBe(1);
    expect(result[0].signals[0].sensor).toBe("ci");
  });

  it("ranks severity: critical > high > medium > low", () => {
    const report = {
      regressions: [
        {
          sensor: "acmm",
          metric: "level",
          current: 4,
          previous: 5,
          delta: -1,
          severity: "medium",
          timestamp: now,
        },
        {
          sensor: "sentry",
          metric: "error_rate",
          current: 100,
          previous: 5,
          delta: 95,
          severity: "critical",
          timestamp: twoDaysAgo,
        },
        {
          sensor: "lighthouse",
          metric: "a11y",
          current: 0.6,
          previous: 0.9,
          delta: -0.3,
          severity: "high",
          timestamp: twoDaysAgo,
        },
      ],
    };
    const result = correlate(report, []);
    expect(result[0].severity).toBe("critical");
    expect(result[1].severity).toBe("high");
    expect(result[2].severity).toBe("medium");
  });

  it("uses signal count as tiebreaker within same severity", () => {
    const report = {
      regressions: [
        {
          sensor: "lighthouse",
          metric: "performance",
          current: 0.7,
          previous: 0.9,
          delta: -0.2,
          severity: "high",
          timestamp: now,
        },
        {
          sensor: "sentry",
          metric: "timeout_rate",
          current: 15,
          previous: 2,
          delta: 13,
          severity: "high",
          timestamp: hourAgo,
        },
        {
          sensor: "acmm",
          metric: "level",
          current: 4,
          previous: 5,
          delta: -1,
          severity: "high",
          timestamp: twoDaysAgo,
        },
      ],
    };
    const result = correlate(report, []);
    expect(result[0].signals.length).toBeGreaterThanOrEqual(
      result[result.length - 1].signals.length
    );
  });

  it("caps output at 3 root causes", () => {
    const report = {
      regressions: [
        { sensor: "lighthouse", metric: "performance", severity: "high", timestamp: now },
        { sensor: "ci", metric: "pass_rate", severity: "high", timestamp: twoDaysAgo },
        {
          sensor: "acmm",
          metric: "level",
          severity: "medium",
          timestamp: new Date(Date.now() - 4 * 86400_000).toISOString(),
        },
        {
          sensor: "sentry",
          metric: "error_count",
          severity: "low",
          timestamp: new Date(Date.now() - 6 * 86400_000).toISOString(),
        },
        {
          sensor: "lighthouse",
          metric: "seo",
          severity: "low",
          timestamp: new Date(Date.now() - 8 * 86400_000).toISOString(),
        },
      ],
    };
    const result = correlate(report, []);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("includes suggestedLabel in output", () => {
    const report = {
      regressions: [
        { sensor: "lighthouse", metric: "performance", severity: "high", timestamp: now },
      ],
    };
    const result = correlate(report, []);
    expect(result[0].suggestedLabel).toBeTruthy();
    expect(typeof result[0].suggestedLabel).toBe("string");
  });

  it("produces correct output shape", () => {
    const report = {
      regressions: [
        {
          sensor: "ci",
          metric: "pass_rate",
          current: 80,
          previous: 100,
          delta: -20,
          severity: "high",
          timestamp: now,
        },
      ],
    };
    const result = correlate(report, []);
    expect(result.length).toBe(1);
    const group = result[0];
    expect(typeof group.rootCause).toBe("string");
    expect(Array.isArray(group.signals)).toBe(true);
    expect(["critical", "high", "medium", "low"]).toContain(group.severity);
    expect(typeof group.suggestedLabel).toBe("string");
  });

  it("handles single signal as standalone group", () => {
    const report = {
      regressions: [
        {
          sensor: "ci",
          metric: "duration",
          current: 300,
          previous: 120,
          delta: 180,
          severity: "medium",
          timestamp: now,
        },
      ],
    };
    const result = correlate(report, []);
    expect(result.length).toBe(1);
    expect(result[0].signals.length).toBe(1);
  });

  it("handles signals without timestamps gracefully", () => {
    const report = {
      regressions: [
        { sensor: "lighthouse", metric: "performance", severity: "high" },
        { sensor: "sentry", metric: "timeout_rate", severity: "high" },
      ],
    };
    const result = correlate(report, []);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});
