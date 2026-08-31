import { describe, it, expect } from "vitest";
import {
  formatSensorStatus,
  getSensorColor,
  formatPercent,
  formatTimestamp,
  normalizeSensorReport,
  type SensorReport,
} from "./ai-health.js";

// Matches scripts/build-sensor-report.mjs's buildReport() output exactly —
// the real shape written to apps/marketing/public/sensor-report.json.
const MOCK_REPORT: SensorReport = {
  generated_at: "2026-05-09T05:48:08.683Z",
  period: { start: "2026-05-02", end: "2026-05-09" },
  sensors: {
    acmm: { available: true, level: 5, criteria_met: 99, criteria_total: 114 },
    ciHealth: { available: true, pass_rate_pct: 100, passed: 5, completed: 5 },
    prMetrics: { available: true, latest: { merged: 16 }, entry_count: 1 },
    issues: { available: true, created_7d: 20, closed_7d: 16, queue_depth: 2 },
  },
  thresholds: {},
  regressions: [],
  summary: { sensors_available: 6, sensors_total: 7, regressions_detected: 0, status: "healthy" },
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
    // `sensors` is a dynamic Record<string, unknown> — cast known test keys to read them.
    const ciHealth = MOCK_REPORT.sensors.ciHealth as { pass_rate_pct: number };
    const issues = MOCK_REPORT.sensors.issues as { queue_depth: number };
    expect(ciHealth.pass_rate_pct).toBe(100);
    expect(issues.queue_depth).toBe(2);
    expect(MOCK_REPORT.summary.sensors_available).toBe(6);
    expect(MOCK_REPORT.regressions).toEqual([]);
  });
});

describe("normalizeSensorReport — queueEfficiency", () => {
  const QUEUE_EFFICIENCY_REPORT = {
    generated_at: "2026-08-02T20:06:07.196Z",
    sensors: {
      queueEfficiency: {
        available: true,
        composite: 0.95,
        sub_metrics: {
          issues_merged: 32,
          first_pass_success_rate: 0.875,
          median_time_to_merge_hours: 0.6,
          median_rework_cycles: 0,
          cost_per_issue_usd: 1.2,
          review_coverage: 0.25,
        },
        distribution: {
          "size:xs": { count: 12, avg_commits: 1.3, avg_ttm_hours: 2.4 },
          "size:m": { count: 9, avg_commits: 1.6, avg_ttm_hours: 2.3 },
        },
        baseline: null,
        regressions: [],
      },
    },
    regressions: [],
    summary: { sensors_available: 1, sensors_total: 1, regressions_detected: 0 },
  };

  it("extracts composite score and sub-metrics when available", () => {
    const metrics = normalizeSensorReport(QUEUE_EFFICIENCY_REPORT);
    expect(metrics.queueEfficiency.available).toBe(true);
    expect(metrics.queueEfficiency.composite).toBe(0.95);
    expect(metrics.queueEfficiency.firstPassSuccessRate).toBe(0.875);
    expect(metrics.queueEfficiency.costPerIssue).toBe(1.2);
    expect(metrics.queueEfficiency.medianTimeToMergeHours).toBe(0.6);
  });

  it("extracts size-tier distribution counts", () => {
    const metrics = normalizeSensorReport(QUEUE_EFFICIENCY_REPORT);
    expect(metrics.queueEfficiency.distribution).toEqual([
      ["size:xs", 12],
      ["size:m", 9],
    ]);
  });

  it("degrades to unavailable without throwing when the sensor is missing", () => {
    const metrics = normalizeSensorReport({ sensors: {} });
    expect(metrics.queueEfficiency.available).toBe(false);
    expect(metrics.queueEfficiency.composite).toBeNull();
    expect(metrics.queueEfficiency.distribution).toEqual([]);
  });
});

describe("normalizeSensorReport — domainActivity", () => {
  // Matches scripts/sensors-registry.mjs's domainActivity registry entry
  // (reads the latest row appended by scripts/collect-domain-metrics.mjs).
  const DOMAIN_ACTIVITY_REPORT = {
    generated_at: "2026-08-05T12:00:00.000Z",
    sensors: {
      domainActivity: {
        available: true,
        date: "2026-08-04",
        venueId: "venue-123",
        reservations_created: 42,
        reservations_cancelled: 3,
        reservations_completed: 35,
        reservations_no_show: 1,
        deposits_held: 20,
        deposits_applied: 15,
        deposits_refunded: 2,
        deposits_forfeited: 1,
      },
    },
    regressions: [],
    summary: { sensors_available: 1, sensors_total: 1, regressions_detected: 0 },
  };

  it("extracts reservation and deposit counts when available", () => {
    const metrics = normalizeSensorReport(DOMAIN_ACTIVITY_REPORT);
    expect(metrics.domainActivity.available).toBe(true);
    expect(metrics.domainActivity.date).toBe("2026-08-04");
    expect(metrics.domainActivity.venueId).toBe("venue-123");
    expect(metrics.domainActivity.reservationsCreated).toBe(42);
    expect(metrics.domainActivity.reservationsCancelled).toBe(3);
    expect(metrics.domainActivity.reservationsCompleted).toBe(35);
    expect(metrics.domainActivity.reservationsNoShow).toBe(1);
    expect(metrics.domainActivity.depositsHeld).toBe(20);
    expect(metrics.domainActivity.depositsApplied).toBe(15);
    expect(metrics.domainActivity.depositsRefunded).toBe(2);
    expect(metrics.domainActivity.depositsForfeited).toBe(1);
  });

  it("degrades to unavailable without throwing when the sensor key is absent", () => {
    const metrics = normalizeSensorReport({ sensors: {} });
    expect(metrics.domainActivity.available).toBe(false);
    expect(metrics.domainActivity.date).toBeNull();
    expect(metrics.domainActivity.reservationsCreated).toBeNull();
    expect(metrics.domainActivity.depositsHeld).toBeNull();
  });

  it("degrades to unavailable without throwing when the sensor ran but the metrics file was empty", () => {
    // Mirrors scripts/sensors-registry.mjs's collect(): an empty/missing
    // metrics/domain-metrics.jsonl returns just `{ available: false }`.
    const metrics = normalizeSensorReport({
      sensors: { domainActivity: { available: false } },
    });
    expect(metrics.domainActivity.available).toBe(false);
    expect(metrics.domainActivity.reservationsCreated).toBeNull();
    expect(metrics.domainActivity.venueId).toBeNull();
  });
});

describe("normalizeSensorReport — acmm", () => {
  // Matches scripts/sensors-registry.mjs's acmm registry entry collect() output.
  const ACMM_REPORT = {
    generated_at: "2026-08-31T12:00:00.000Z",
    sensors: {
      acmm: {
        available: true,
        level: 4,
        level_name: "Managed",
        criteria_met: 88,
        criteria_total: 114,
        last_run: "2026-08-30T09:00:00.000Z",
        capped: true,
        failing_gates: [
          {
            name: "queueEfficiency",
            description: "Queue efficiency composite below threshold",
            value: 0.62,
            threshold: 0.75,
            direction: "min",
          },
        ],
      },
    },
    regressions: [],
    summary: { sensors_available: 1, sensors_total: 1, regressions_detected: 0 },
  };

  it("extracts level, criteria, and failing gates when available", () => {
    const metrics = normalizeSensorReport(ACMM_REPORT);
    expect(metrics.acmm.available).toBe(true);
    expect(metrics.acmm.level).toBe(4);
    expect(metrics.acmm.levelName).toBe("Managed");
    expect(metrics.acmm.criteriaMet).toBe(88);
    expect(metrics.acmm.criteriaTotal).toBe(114);
    expect(metrics.acmm.lastRun).toBe("2026-08-30T09:00:00.000Z");
    expect(metrics.acmm.capped).toBe(true);
    expect(metrics.acmm.failingGates).toEqual([
      {
        name: "queueEfficiency",
        description: "Queue efficiency composite below threshold",
        value: 0.62,
        threshold: 0.75,
        direction: "min",
      },
    ]);
  });

  it("degrades to unavailable without throwing when the sensor key is absent", () => {
    const metrics = normalizeSensorReport({ sensors: {} });
    expect(metrics.acmm.available).toBe(false);
    expect(metrics.acmm.level).toBeNull();
    expect(metrics.acmm.levelName).toBeNull();
    expect(metrics.acmm.criteriaMet).toBeNull();
    expect(metrics.acmm.criteriaTotal).toBeNull();
    expect(metrics.acmm.lastRun).toBeNull();
    expect(metrics.acmm.capped).toBe(false);
    expect(metrics.acmm.failingGates).toEqual([]);
  });
});
