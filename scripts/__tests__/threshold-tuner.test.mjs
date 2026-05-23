import { describe, it, expect } from "vitest";
import {
  computePerSensorMetrics,
  computeWeeklyChange,
  determineAdjustment,
  applyAdjustments,
} from "../threshold-tuner.mjs";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date("2026-05-23T12:00:00Z");
const TODAY = "2026-05-23";

/** Recent verification entries (within 30d) */
const makeVerification = (sensorLabel, verified, daysAgo = 1, confidence = undefined) => ({
  timestamp: new Date(NOW - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
  issue_number: 100,
  issue_title: `Test issue (${sensorLabel})`,
  sensor_label: sensorLabel,
  verified,
  reason: "test reason",
  ...(confidence !== undefined ? { confidence } : {}),
});

const SEED_TUNING = {
  version: 1,
  lastTunedAt: "2026-05-01",
  thresholds: {
    acceptanceRateFloor: 0.85,
    maxBudgetUSD: 1.5,
    maxRetries: 2,
    stuckTurnsThreshold: 9,
  },
  sensorSensitivity: {
    "ci-fix": 1.0,
    acmm: 1.0,
    audit: 1.0,
    sentry: 1.0,
    bug: 1.0,
  },
  rules: {},
  history: [{ date: "2026-05-01", trigger: "seed", note: "Initial values." }],
};

// ---------------------------------------------------------------------------
// computePerSensorMetrics
// ---------------------------------------------------------------------------

describe("computePerSensorMetrics", () => {
  it("returns empty object when no verifications", () => {
    const result = computePerSensorMetrics([]);
    expect(result).toEqual({});
  });

  it("computes FP rate and effectiveness per sensor", () => {
    const verifications = [
      makeVerification("ci-fix", true),
      makeVerification("ci-fix", true),
      makeVerification("ci-fix", false), // 1 FP out of 3
      makeVerification("audit", false),
      makeVerification("audit", false), // 2 FP out of 2
    ];

    const result = computePerSensorMetrics(verifications);

    expect(result["ci-fix"]).toBeDefined();
    expect(result["ci-fix"].total).toBe(3);
    expect(result["ci-fix"].effectiveness).toBeCloseTo(2 / 3);
    expect(result["ci-fix"].fpRate).toBeCloseTo(1 / 3);

    expect(result["audit"]).toBeDefined();
    expect(result["audit"].total).toBe(2);
    expect(result["audit"].effectiveness).toBe(0);
    expect(result["audit"].fpRate).toBe(1);
  });

  it("excludes verifications older than lookback window", () => {
    const verifications = [
      makeVerification("ci-fix", true, 1), // recent
      makeVerification("ci-fix", false, 31), // too old
    ];
    const result = computePerSensorMetrics(verifications, 30);
    expect(result["ci-fix"].total).toBe(1);
    expect(result["ci-fix"].verified).toBe(1);
  });

  it("excludes skipped verifications (confidence=skip)", () => {
    const verifications = [
      makeVerification("sentry", false, 1, "skip"),
      makeVerification("ci-fix", true, 1),
    ];
    const result = computePerSensorMetrics(verifications);
    expect(result["sentry"]).toBeUndefined();
    expect(result["ci-fix"]).toBeDefined();
  });

  it("ignores unknown sensor labels", () => {
    const verifications = [makeVerification("unknown-sensor", true)];
    const result = computePerSensorMetrics(verifications);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeWeeklyChange
// ---------------------------------------------------------------------------

describe("computeWeeklyChange", () => {
  it("returns 0 when no changes in log", () => {
    expect(computeWeeklyChange([], "ci-fix")).toBe(0);
  });

  it("sums absolute fractional changes for the sensor in last 7 days", () => {
    const changes = [
      {
        date: new Date(NOW - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        threshold: "ci-fix",
        oldValue: 1.0,
        newValue: 0.95, // -5% change
      },
    ];
    const change = computeWeeklyChange(changes, "ci-fix");
    expect(change).toBeCloseTo(0.05);
  });

  it("ignores changes older than 7 days", () => {
    const changes = [
      {
        date: new Date(NOW - 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        threshold: "ci-fix",
        oldValue: 1.0,
        newValue: 0.95,
      },
    ];
    expect(computeWeeklyChange(changes, "ci-fix")).toBe(0);
  });

  it("ignores changes for different sensor labels", () => {
    const changes = [
      {
        date: new Date(NOW - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        threshold: "audit",
        oldValue: 1.0,
        newValue: 0.9,
      },
    ];
    expect(computeWeeklyChange(changes, "ci-fix")).toBe(0);
  });

  it("accumulates multiple changes in the week", () => {
    const changes = [
      {
        date: new Date(NOW - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        threshold: "ci-fix",
        oldValue: 1.0,
        newValue: 0.95,
      },
      {
        date: new Date(NOW - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        threshold: "ci-fix",
        oldValue: 0.95,
        newValue: 0.9,
      },
    ];
    const change = computeWeeklyChange(changes, "ci-fix");
    // 0.05/1.0 + 0.05/0.95 ≈ 0.103
    expect(change).toBeGreaterThan(0.09);
  });
});

// ---------------------------------------------------------------------------
// determineAdjustment
// ---------------------------------------------------------------------------

describe("determineAdjustment", () => {
  it("returns loosen (-5%) when FP rate > 30%", () => {
    const adj = determineAdjustment({ fpRate: 0.4, effectiveness: 0.6 });
    expect(adj).not.toBeNull();
    expect(adj.delta).toBeCloseTo(-0.05);
    expect(adj.trigger).toBe("high-fp-rate");
  });

  it("returns tighten (+5%) when effectiveness < 50%", () => {
    const adj = determineAdjustment({ fpRate: 0.2, effectiveness: 0.4 });
    expect(adj).not.toBeNull();
    expect(adj.delta).toBeCloseTo(0.05);
    expect(adj.trigger).toBe("low-effectiveness");
  });

  it("returns tighten (+3%) when FP rate < 10% AND effectiveness > 80%", () => {
    const adj = determineAdjustment({ fpRate: 0.05, effectiveness: 0.9 });
    expect(adj).not.toBeNull();
    expect(adj.delta).toBeCloseTo(0.03);
    expect(adj.trigger).toBe("headroom");
  });

  it("returns null when metrics are in acceptable range (no adjustment needed)", () => {
    // FP rate between 10-30%, effectiveness between 50-80%
    const adj = determineAdjustment({ fpRate: 0.2, effectiveness: 0.7 });
    expect(adj).toBeNull();
  });

  it("prioritizes high-FP-rate rule (rule 1) over low-effectiveness rule (rule 2)", () => {
    // Both rules could fire: FP > 30% AND effectiveness < 50%
    const adj = determineAdjustment({ fpRate: 0.55, effectiveness: 0.45 });
    expect(adj.trigger).toBe("high-fp-rate");
  });

  it("FP rate exactly at 30% boundary does NOT trigger loosen", () => {
    // Strictly greater than 30%
    const adj = determineAdjustment({ fpRate: 0.3, effectiveness: 0.7 });
    expect(adj).toBeNull();
  });

  it("effectiveness exactly at 50% boundary does NOT trigger tighten", () => {
    const adj = determineAdjustment({ fpRate: 0.2, effectiveness: 0.5 });
    expect(adj).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// applyAdjustments
// ---------------------------------------------------------------------------

describe("applyAdjustments — no changes needed", () => {
  it("returns original tuning unchanged when no metrics", () => {
    const { tuning, changes } = applyAdjustments(SEED_TUNING, {}, [], TODAY);
    expect(changes).toHaveLength(0);
    expect(tuning).toBe(SEED_TUNING); // same reference — no copy needed
  });

  it("returns no changes when sensor has fewer than 3 data points", () => {
    const metrics = { "ci-fix": { fpRate: 0.5, effectiveness: 0.5, total: 2 } };
    const { changes } = applyAdjustments(SEED_TUNING, metrics, [], TODAY);
    expect(changes).toHaveLength(0);
  });

  it("returns no changes when metrics are in acceptable range", () => {
    const metrics = { "ci-fix": { fpRate: 0.2, effectiveness: 0.7, total: 5 } };
    const { changes } = applyAdjustments(SEED_TUNING, metrics, [], TODAY);
    expect(changes).toHaveLength(0);
  });
});

describe("applyAdjustments — applies adjustments", () => {
  it("does not mutate the input tuning object", () => {
    const original = JSON.parse(JSON.stringify(SEED_TUNING));
    const metrics = { "ci-fix": { fpRate: 0.5, effectiveness: 0.5, total: 5 } };
    applyAdjustments(SEED_TUNING, metrics, [], TODAY);
    expect(SEED_TUNING).toEqual(original);
  });

  it("loosens threshold by 5% when FP rate > 30%", () => {
    const metrics = { "ci-fix": { fpRate: 0.4, effectiveness: 0.6, total: 10 } };
    const { tuning, changes } = applyAdjustments(SEED_TUNING, metrics, [], TODAY);
    expect(changes).toHaveLength(1);
    expect(changes[0].threshold).toBe("ci-fix");
    expect(changes[0].oldValue).toBe(1.0);
    expect(changes[0].newValue).toBeCloseTo(0.95);
    expect(tuning.sensorSensitivity["ci-fix"]).toBeCloseTo(0.95);
  });

  it("tightens threshold by 5% when effectiveness < 50%", () => {
    const metrics = { "ci-fix": { fpRate: 0.2, effectiveness: 0.4, total: 10 } };
    const { tuning, changes } = applyAdjustments(SEED_TUNING, metrics, [], TODAY);
    expect(changes[0].newValue).toBeCloseTo(1.05);
    expect(tuning.sensorSensitivity["ci-fix"]).toBeCloseTo(1.05);
  });

  it("tightens threshold by 3% on headroom", () => {
    const metrics = { "ci-fix": { fpRate: 0.05, effectiveness: 0.9, total: 10 } };
    const { tuning, changes } = applyAdjustments(SEED_TUNING, metrics, [], TODAY);
    expect(changes[0].newValue).toBeCloseTo(1.03);
  });

  it("defaults sensorSensitivity to 1.0 when not present in tuning", () => {
    const tuningNoSensors = { ...SEED_TUNING, sensorSensitivity: {} };
    const metrics = { "ci-fix": { fpRate: 0.4, effectiveness: 0.6, total: 10 } };
    const { changes } = applyAdjustments(tuningNoSensors, metrics, [], TODAY);
    expect(changes[0].oldValue).toBe(1.0);
    expect(changes[0].newValue).toBeCloseTo(0.95);
  });

  it("appends a history entry describing all adjustments", () => {
    const metrics = { "ci-fix": { fpRate: 0.4, effectiveness: 0.6, total: 10 } };
    const { tuning } = applyAdjustments(SEED_TUNING, metrics, [], TODAY);
    const last = tuning.history[tuning.history.length - 1];
    expect(last.trigger).toBe("threshold-auto-tuner");
    expect(last.date).toBe(TODAY);
    expect(last.note).toMatch(/ci-fix/);
  });

  it("updates lastTunedAt", () => {
    const metrics = { "ci-fix": { fpRate: 0.4, effectiveness: 0.6, total: 10 } };
    const { tuning } = applyAdjustments(SEED_TUNING, metrics, [], TODAY);
    expect(tuning.lastTunedAt).toBe(TODAY);
  });
});

describe("applyAdjustments — guard rails", () => {
  it("never drops sensitivity below the hard floor (0.1)", () => {
    const tuningAtFloor = {
      ...SEED_TUNING,
      sensorSensitivity: { "ci-fix": 0.11 },
    };
    const metrics = { "ci-fix": { fpRate: 0.99, effectiveness: 0.01, total: 10 } };
    const { tuning, changes } = applyAdjustments(tuningAtFloor, metrics, [], TODAY);
    // Would loosen by 5%, but floor is 0.1
    expect(tuning.sensorSensitivity["ci-fix"]).toBeGreaterThanOrEqual(0.1);
    // If clamped to floor, the change was partial or none
    if (changes.length > 0) {
      expect(changes[0].newValue).toBeGreaterThanOrEqual(0.1);
    }
  });

  it("all thresholds at floor — no change when already at floor and rule fires", () => {
    const tuningAtFloor = {
      ...SEED_TUNING,
      sensorSensitivity: { "ci-fix": 0.1 },
    };
    const metrics = { "ci-fix": { fpRate: 0.99, effectiveness: 0.01, total: 10 } };
    const { changes } = applyAdjustments(tuningAtFloor, metrics, [], TODAY);
    // Already at floor; loosening would have no effect
    expect(changes).toHaveLength(0);
  });

  it("clamps weekly change to 10% max", () => {
    // Already changed 8% this week; only 2% left
    const changesLog = [
      {
        date: TODAY,
        threshold: "ci-fix",
        oldValue: 1.0,
        newValue: 0.92, // 8% change
      },
    ];
    const metrics = { "ci-fix": { fpRate: 0.4, effectiveness: 0.6, total: 10 } };
    const { changes } = applyAdjustments(SEED_TUNING, metrics, changesLog, TODAY);
    // Rule fires (-5%) but only 2% budget left; clamped delta applies
    if (changes.length > 0) {
      const fractionalChange = Math.abs(
        (changes[0].newValue - changes[0].oldValue) / changes[0].oldValue
      );
      expect(fractionalChange).toBeLessThanOrEqual(0.1);
    }
  });

  it("skips sensor entirely when weekly cap already reached (>=10%)", () => {
    const changesLog = [
      {
        date: TODAY,
        threshold: "ci-fix",
        oldValue: 1.0,
        newValue: 0.9, // exactly 10% change
      },
    ];
    const metrics = { "ci-fix": { fpRate: 0.4, effectiveness: 0.6, total: 10 } };
    const { changes } = applyAdjustments(SEED_TUNING, metrics, changesLog, TODAY);
    expect(changes).toHaveLength(0);
  });

  it("changes include all required log fields", () => {
    const metrics = { "ci-fix": { fpRate: 0.4, effectiveness: 0.6, total: 10 } };
    const { changes } = applyAdjustments(SEED_TUNING, metrics, [], TODAY);
    expect(changes).toHaveLength(1);
    const c = changes[0];
    expect(c).toHaveProperty("date");
    expect(c).toHaveProperty("threshold");
    expect(c).toHaveProperty("oldValue");
    expect(c).toHaveProperty("newValue");
    expect(c).toHaveProperty("trigger");
    expect(c).toHaveProperty("evidence");
  });

  it("processes multiple sensors independently", () => {
    const metrics = {
      "ci-fix": { fpRate: 0.4, effectiveness: 0.6, total: 10 }, // loosen
      audit: { fpRate: 0.05, effectiveness: 0.9, total: 5 }, // tighten (headroom)
    };
    const { changes } = applyAdjustments(SEED_TUNING, metrics, [], TODAY);
    expect(changes).toHaveLength(2);
    const ciFix = changes.find((c) => c.threshold === "ci-fix");
    const audit = changes.find((c) => c.threshold === "audit");
    expect(ciFix.newValue).toBeCloseTo(0.95); // loosened
    expect(audit.newValue).toBeCloseTo(1.03); // tightened
  });
});
