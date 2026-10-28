import { describe, it, expect } from "vitest";
import metricsJson from "../../public/metrics.json";
import { MEASUREMENT_DATE } from "./measurement-date.js";

describe("MEASUREMENT_DATE", () => {
  it("is the same timestamp /metrics shows as its last-updated date", () => {
    // /metrics fetches public/metrics.json and renders its generatedAt.
    expect(MEASUREMENT_DATE).toBe(metricsJson.generatedAt);
  });
});
