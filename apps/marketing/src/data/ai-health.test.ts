import { describe, it, expect } from "vitest";
import {
  formatSensorStatus,
  getSensorColor,
  formatPercent,
  formatTimestamp,
  type SensorReport,
} from "./ai-health.js";

const MOCK_REPORT: SensorReport = {
  timestamp: "2026-05-09T05:48:08.683Z",
  sensors: {
    acmm: { available: true, level: "unknown", score: 0, gaps: 0 },
    ci: { available: true, passRate: 100, recentRuns: 5 },
    prMetrics: { available: true, merged30d: 16 },
    issues: { available: true, open: 14, ready: 2 },
    lighthouse: {
      available: false,
      surfacesChecked: 0,
      surfacesTotal: 4,
      note: "needs first run",
    },
    sentry: { available: true, totalIssues: 0, errorCount: 0, note: "healthy" },
    agentCost: { available: true, sessions: 0 },
  },
  regressions: [],
  summary: { available: 6, total: 7 },
};

describe("formatSensorStatus", () => {
  it("returns 'Available' for available sensor", () => {
    expect(formatSensorStatus(true)).toBe("Available");
  });

  it("returns 'Unavailable' for unavailable sensor", () => {
    expect(formatSensorStatus(false)).toBe("Unavailable");
  });
});

describe("getSensorColor", () => {
  it("returns green for available sensor", () => {
    expect(getSensorColor(true)).toBe("green");
  });

  it("returns red for unavailable sensor", () => {
    expect(getSensorColor(false)).toBe("red");
  });
});

describe("formatPercent", () => {
  it("formats integer rate as percentage string", () => {
    expect(formatPercent(100)).toBe("100%");
  });

  it("formats zero as 0%", () => {
    expect(formatPercent(0)).toBe("0%");
  });

  it("rounds to one decimal when not whole", () => {
    expect(formatPercent(95.5)).toBe("95.5%");
  });
});

describe("formatTimestamp", () => {
  it("formats ISO timestamp to readable date", () => {
    const result = formatTimestamp("2026-05-09T05:48:08.683Z");
    expect(result).toContain("2026");
    expect(result).toContain("May");
  });

  it("handles null or undefined gracefully", () => {
    expect(formatTimestamp(null)).toBe("Never");
    expect(formatTimestamp(undefined)).toBe("Never");
  });
});

describe("SensorReport type", () => {
  it("mock report matches expected shape", () => {
    expect(MOCK_REPORT.sensors.ci.passRate).toBe(100);
    expect(MOCK_REPORT.sensors.issues.ready).toBe(2);
    expect(MOCK_REPORT.summary.available).toBe(6);
    expect(MOCK_REPORT.regressions).toEqual([]);
  });
});
