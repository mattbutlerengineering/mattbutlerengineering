import { describe, it, expect, vi, afterEach } from "vitest";
import {
  SENSORS,
  getSensorByLabel,
  getAllLabels,
  buildCategoryMap,
  buildLabelMap,
  getReportSensors,
  collectReportSensors,
} from "../sensors-registry.mjs";

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
        { id: "brokenSensor", collect: () => { throw boom; } },
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
});
