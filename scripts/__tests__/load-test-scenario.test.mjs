import { describe, it, expect } from "vitest";
import { selectScenarios } from "../load-test-scenario.mjs";

const ALL_SCENARIOS = {
  smoke: { executor: "constant-vus", vus: 1, duration: "30s" },
  load: { executor: "ramping-vus", startVUs: 0 },
  stress: { executor: "ramping-vus", startVUs: 0 },
};

describe("selectScenarios", () => {
  it("returns only the requested scenario when it exists", () => {
    expect(selectScenarios(ALL_SCENARIOS, "smoke")).toEqual({ smoke: ALL_SCENARIOS.smoke });
  });

  it("returns every scenario when no scenario is requested", () => {
    expect(selectScenarios(ALL_SCENARIOS, undefined)).toBe(ALL_SCENARIOS);
  });

  it("returns every scenario when the requested name is empty", () => {
    expect(selectScenarios(ALL_SCENARIOS, "")).toBe(ALL_SCENARIOS);
  });

  it("returns every scenario when the requested name doesn't exist", () => {
    expect(selectScenarios(ALL_SCENARIOS, "bogus")).toBe(ALL_SCENARIOS);
  });
});
