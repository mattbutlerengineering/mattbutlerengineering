import { describe, expect, it } from "vitest";
import { describeSensor, humanizeKey, sensorLabel } from "./sensor-labels";

describe("sensor labels", () => {
  it("falls back to sentence case for unknown camelCase keys", () => {
    expect(sensorLabel("someNewSensor")).toBe("Some new sensor");
  });

  it("maps known keys to readable labels", () => {
    expect(sensorLabel("ciHealth")).toBe("CI health");
    expect(sensorLabel("productionHealth")).toBe("Production health");
  });

  it("gives every known sensor a one-line description", () => {
    for (const key of [
      "acmm",
      "prMetrics",
      "metricsFreshness",
      "reviewBurden",
      "productionHealth",
      "prCategoryMetrics",
      "agentCost",
      "ccusageCost",
      "ciHealth",
      "lighthouse",
      "issues",
      "issueFeedback",
      "sessionLogs",
      "codeChurn",
      "auditCoverage",
      "mutationScore",
      "flakyTests",
      "e2eStability",
      "queueEfficiency",
    ]) {
      expect(describeSensor(key), key).toBeTruthy();
      expect(sensorLabel(key), key).not.toMatch(/[a-z][A-Z]/);
    }
    expect(describeSensor("someNewSensor")).toBeNull();
  });

  it("humanizes snake_case metric names", () => {
    expect(humanizeKey("pass_rate_pct")).toBe("Pass rate pct");
  });
});
