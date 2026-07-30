import { describe, it, expect } from "vitest";
import { checkFreshness } from "../generate-metrics-json.mjs";

describe("checkFreshness", () => {
  it("does not throw when lastRun is within the 14-day freshness window", () => {
    const now = new Date("2026-07-30T00:00:00Z");
    const lastRun = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();

    expect(() => checkFreshness(lastRun, { now })).not.toThrow();
  });

  it("does not throw exactly at the 14-day boundary", () => {
    const now = new Date("2026-07-30T00:00:00Z");
    const lastRun = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

    expect(() => checkFreshness(lastRun, { now })).not.toThrow();
  });

  it("throws naming the state file and age when lastRun exceeds 14 days", () => {
    const now = new Date("2026-07-30T00:00:00Z");
    const lastRun = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString();

    expect(() => checkFreshness(lastRun, { now, statePath: "/fake/state.json" })).toThrow(
      /\/fake\/state\.json/
    );
    expect(() => checkFreshness(lastRun, { now, statePath: "/fake/state.json" })).toThrow(
      /20\.0 days/
    );
  });

  it("throws naming the state file when lastRun is missing", () => {
    expect(() => checkFreshness(undefined, { statePath: "/fake/state.json" })).toThrow(
      /\/fake\/state\.json/
    );
  });
});
