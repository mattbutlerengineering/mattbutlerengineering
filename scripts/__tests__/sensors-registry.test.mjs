import { describe, it, expect } from "vitest";
import {
  SENSORS,
  getSensorByLabel,
  getAllLabels,
  buildCategoryMap,
  buildLabelMap,
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

  it("every sensor has id, category, issueLabels, severity, and verifyFix", () => {
    for (const sensor of SENSORS) {
      expect(typeof sensor.id).toBe("string");
      expect(typeof sensor.category).toBe("string");
      expect(Array.isArray(sensor.issueLabels)).toBe(true);
      expect(sensor.issueLabels.length).toBeGreaterThan(0);
      expect(typeof sensor.severity).toBe("string");
      expect(typeof sensor.verifyFix).toBe("function");
    }
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

  it("getSensorByLabel returns null for unknown labels", () => {
    const sensor = getSensorByLabel("nonexistent-label-xyz");
    expect(sensor).toBeNull();
  });

  it("verifyFix function returns an object with verified and reason fields", () => {
    for (const sensor of SENSORS) {
      // verifyFix is called with (issueTitle, issueBody) — test stub call
      const result = sensor.verifyFix("test issue title", "test body");
      if (result !== null) {
        expect(typeof result.verified).toBe("boolean");
        expect(typeof result.reason).toBe("string");
      }
    }
  });
});
