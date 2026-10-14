import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { normalizeSensorReport } from "./ai-health.js";

describe("normalizeSensorReport — committed sensor-report.json", () => {
  const committed: unknown = JSON.parse(
    readFileSync(resolve(__dirname, "../../public/sensor-report.json"), "utf8")
  );

  it("yields a real value for every key-metric stat", () => {
    const metrics = normalizeSensorReport(committed);
    expect(metrics.issuesOpen).not.toBeNull();
    expect(metrics.issuesReady).not.toBeNull();
    expect(metrics.ciPassRate).not.toBeNull();
    expect(metrics.prsMerged).not.toBeNull();
    expect(metrics.sensorsAvailable).not.toBeNull();
    expect(metrics.sensorsTotal).not.toBeNull();
  });

  it("surfaces the as-of date of the PR-metrics snapshot", () => {
    const metrics = normalizeSensorReport(committed);
    expect(metrics.prMetricsAsOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("normalizeSensorReport — builder shape only", () => {
  it("ignores field names buildReport never emits", () => {
    const metrics = normalizeSensorReport({
      sensors: {
        ci: { passRate: 99, recentRuns: 9 },
        prMetrics: { merged30d: 7 },
        issues: { ready: 4 },
      },
      summary: { available: 3, total: 4 },
    });
    expect(metrics.ciPassRate).toBeNull();
    expect(metrics.prsMerged).toBeNull();
    expect(metrics.issuesReady).toBeNull();
    expect(metrics.sensorsAvailable).toBeNull();
  });
});
