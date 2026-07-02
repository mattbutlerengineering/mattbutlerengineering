import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  SENSORS,
  getSensorByLabel,
  getAllLabels,
  buildCategoryMap,
  buildLabelMap,
  getReportSensors,
  collectReportSensors,
  buildThresholds,
} from "../sensors-registry.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("sensors-registry", () => {
  it("exports a SENSORS array with at least one entry per known sensor", () => {
    const ids = SENSORS.map((s) => s.id);
    expect(ids).toContain("lighthouse");
    expect(ids).toContain("ci");
    expect(ids).toContain("sentry");
    expect(ids).toContain("acmm");
    expect(ids).toContain("cors");
  });

  it("every sensor has an id and a category", () => {
    for (const sensor of SENSORS) {
      expect(typeof sensor.id).toBe("string");
      expect(typeof sensor.category).toBe("string");
    }
  });

  it("every issue-filing sensor (has issueLabels) also has severity and verifyFix", () => {
    for (const sensor of SENSORS) {
      if (!sensor.issueLabels) continue;
      expect(Array.isArray(sensor.issueLabels)).toBe(true);
      expect(sensor.issueLabels.length).toBeGreaterThan(0);
      expect(typeof sensor.severity).toBe("string");
      expect(typeof sensor.verifyFix).toBe("function");
    }
  });

  it("getReportSensors returns only entries with a collect function, each carrying a format function", () => {
    const reportSensors = getReportSensors();
    expect(reportSensors.length).toBeGreaterThan(0);
    for (const sensor of reportSensors) {
      expect(typeof sensor.collect).toBe("function");
      expect(typeof sensor.format).toBe("function");
    }
    // sentry/cors/bug are label-only entries — they must NOT appear in the report.
    const reportIds = reportSensors.map((s) => s.reportKey ?? s.id);
    expect(reportIds).not.toContain("sentry");
    expect(reportIds).not.toContain("cors");
    expect(reportIds).not.toContain("bug");
    expect(reportIds).toContain("ciHealth");
  });

  it("every producer issueLabel is resolvable via getSensorByLabel", () => {
    // Known producer labels — this is the key coverage gap the issue describes:
    // 'security' (from cors-audit) was invisible to the verifier
    const producerLabels = ["audit", "ci-fix", "acmm", "sentry", "bug", "security"];
    for (const label of producerLabels) {
      const sensor = getSensorByLabel(label);
      expect(sensor, `label "${label}" has no sensor entry`).not.toBeNull();
    }
  });

  it("getAllLabels returns all issue labels across all sensors", () => {
    const labels = getAllLabels();
    expect(labels).toContain("audit");
    expect(labels).toContain("ci-fix");
    expect(labels).toContain("acmm");
    expect(labels).toContain("sentry");
    expect(labels).toContain("bug");
    expect(labels).toContain("security");
  });

  it("buildCategoryMap produces a map of category → metric keys", () => {
    const map = buildCategoryMap();
    expect(typeof map).toBe("object");
    expect(Array.isArray(map.performance)).toBe(true);
    expect(Array.isArray(map.availability)).toBe(true);
    expect(Array.isArray(map.quality)).toBe(true);
  });

  it("buildLabelMap produces a map of sensorId → primary label", () => {
    const map = buildLabelMap();
    expect(map.lighthouse).toBe("audit");
    expect(map.ci).toBe("ci-fix");
    expect(map.sentry).toBe("sentry");
    expect(map.acmm).toBe("acmm");
    expect(map.cors).toBeDefined();
  });

  it("buildLabelMap also keys by reportKey, so ciHealth regressions resolve to ci-fix", () => {
    // detectRegression on the "ci" entry emits `sensor: "ciHealth"` (its reportKey),
    // not the registry id "ci" — the map must be resolvable by both.
    const map = buildLabelMap();
    expect(map.ciHealth).toBe("ci-fix");
  });

  it("getSensorByLabel returns null for unknown labels", () => {
    const sensor = getSensorByLabel("nonexistent-label-xyz");
    expect(sensor).toBeNull();
  });

  describe("collectReportSensors", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("logs and reports unavailable when a collector throws unexpectedly", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const boom = new Error("boom");
      const entries = [
        {
          id: "brokenSensor",
          collect: () => {
            throw boom;
          },
        },
      ];

      const result = collectReportSensors(entries, {});

      expect(result.brokenSensor).toEqual({ available: false });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0].join(" ")).toContain("brokenSensor");
    });

    it("keys collected data by reportKey when present, otherwise id", () => {
      const entries = [
        { id: "ci", reportKey: "ciHealth", collect: () => ({ available: true }) },
        { id: "acmm", collect: () => ({ available: true }) },
      ];

      const result = collectReportSensors(entries, {});

      expect(result.ciHealth).toEqual({ available: true });
      expect(result.acmm).toEqual({ available: true });
    });
  });

  it("verifyFix function returns an object with verified and reason fields", () => {
    for (const sensor of SENSORS) {
      if (!sensor.verifyFix) continue;
      // verifyFix is called with (issueTitle, issueBody) — test stub call
      const result = sensor.verifyFix("test issue title", "test body");
      if (result !== null) {
        expect(typeof result.verified).toBe("boolean");
        expect(typeof result.reason).toBe("string");
      }
    }
  });

  describe("threshold co-location", () => {
    // Sensors known to read a value out of detectRegression's `thresholds` param.
    const THRESHOLD_CONSUMERS = {
      ci: "ci_pass_rate_drop",
      lighthouse: "lighthouse_score_drop",
      codeChurn: "code_churn_rate_max",
      queueEfficiency: "queue_efficiency_composite_drop",
    };

    it("each threshold-consuming entry declares its own thresholds next to detectRegression", () => {
      for (const [id, key] of Object.entries(THRESHOLD_CONSUMERS)) {
        const sensor = SENSORS.find((s) => s.id === id);
        expect(sensor, `sensor "${id}" not found`).toBeDefined();
        expect(typeof sensor.detectRegression).toBe("function");
        expect(sensor.thresholds, `sensor "${id}" has no thresholds field`).toBeTypeOf("object");
        expect(sensor.thresholds).toHaveProperty(key);
        expect(typeof sensor.thresholds[key]).toBe("number");
      }
    });

    // Fixture current/previous data crafted so the delta sits just past each
    // sensor's own co-located threshold value (declared above in SENSORS).
    const COUPLING_FIXTURES = {
      ci: {
        current: { available: true, pass_rate_pct: 90 },
        previous: { available: true, pass_rate_pct: 96 }, // delta -6
        looseOverride: { ci_pass_rate_drop: 10 },
      },
      lighthouse: {
        current: {
          available: true,
          surfaces: [{ url: "https://example.com/", scores: { performance: 0.8 } }],
        },
        previous: {
          available: true,
          surfaces: [{ url: "https://example.com/", scores: { performance: 0.9 } }], // delta -0.1
        },
        looseOverride: { lighthouse_score_drop: 0.5 },
      },
      codeChurn: {
        current: { available: true, churn_rate: 0.35 },
        previous: undefined,
        looseOverride: { code_churn_rate_max: 0.9 },
      },
      queueEfficiency: {
        current: { available: true, composite: 0.5, regressions: [] },
        previous: { available: true, composite: 0.6 }, // delta -0.1
        looseOverride: { queue_efficiency_composite_drop: 0.5 },
      },
    };

    it("each entry's own co-located threshold value actually drives its own detectRegression", () => {
      for (const id of Object.keys(THRESHOLD_CONSUMERS)) {
        const sensor = SENSORS.find((s) => s.id === id);
        const { current, previous, looseOverride } = COUPLING_FIXTURES[id];

        // Using the sensor's own declared threshold: the fixture delta was
        // chosen to just exceed it, so a regression must fire.
        const tight = sensor.detectRegression(current, previous, sensor.thresholds);
        expect(
          tight.length,
          `${id} should regress at its own co-located threshold`
        ).toBeGreaterThan(0);

        // Same data, but with that one key loosened: no regression — proves
        // detectRegression reads the value from the passed-in thresholds
        // object (i.e. from the registry entry), not a hardcoded literal.
        const loose = sensor.detectRegression(current, previous, looseOverride);
        expect(loose.length, `${id} should not regress past a loosened threshold`).toBe(0);
      }
    });

    it("buildThresholds merges every entry's co-located thresholds into one flat object", () => {
      const thresholds = buildThresholds();
      expect(thresholds).toMatchObject({
        ci_pass_rate_drop: 5,
        lighthouse_score_drop: 0.05,
        code_churn_rate_max: 0.3,
        queue_efficiency_composite_drop: 0.05,
        queue_efficiency_fps_drop: 0.1,
      });
    });

    it("sensor-report.mjs has no hand-maintained THRESHOLDS blob or per-sensor threshold imports", () => {
      const shimSource = readFileSync(resolve(__dirname, "..", "sensor-report.mjs"), "utf-8");
      expect(shimSource).not.toMatch(/const THRESHOLDS\s*=/);
      expect(shimSource).not.toMatch(/CODE_CHURN_THRESHOLD/);
      expect(shimSource).not.toMatch(/QUEUE_EFFICIENCY_(COMPOSITE|FPS)_DROP/);
      expect(shimSource).toMatch(/buildThresholds/);
    });
  });
});
