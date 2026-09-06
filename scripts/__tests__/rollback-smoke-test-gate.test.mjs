import { describe, it, expect } from "vitest";
import { smokeTestsRanAndFailed } from "../rollback-smoke-test-gate.mjs";

describe("smokeTestsRanAndFailed", () => {
  it("returns false when there are no jobs at all", () => {
    expect(smokeTestsRanAndFailed([])).toBe(false);
  });

  it("returns false when every job succeeded", () => {
    const jobs = [
      { name: "Post-Deploy Smoke Test", conclusion: "success", steps: [] },
      { name: "Playwright Smoke Tests", conclusion: "success", steps: [] },
    ];
    expect(smokeTestsRanAndFailed(jobs)).toBe(false);
  });

  it("returns false when playwright-smoke failed solely because the deploy poll timed out (#5006 gap)", () => {
    const jobs = [
      {
        name: "Playwright Smoke Tests",
        conclusion: "failure",
        steps: [
          { name: "Poll for deploy to land", conclusion: "failure" },
          { name: "Run smoke tests", conclusion: "skipped" },
        ],
      },
    ];
    expect(smokeTestsRanAndFailed(jobs)).toBe(false);
  });

  it("returns false when the 'Run smoke tests' step is absent entirely (API shape surprise) — fails closed", () => {
    const jobs = [
      {
        name: "Playwright Smoke Tests",
        conclusion: "failure",
        steps: [{ name: "Poll for deploy to land", conclusion: "failure" }],
      },
    ];
    expect(smokeTestsRanAndFailed(jobs)).toBe(false);
  });

  it("returns true when the deploy was confirmed but the smoke tests genuinely failed", () => {
    const jobs = [
      {
        name: "Playwright Smoke Tests",
        conclusion: "failure",
        steps: [
          { name: "Poll for deploy to land", conclusion: "success" },
          { name: "Run smoke tests", conclusion: "failure" },
        ],
      },
    ];
    expect(smokeTestsRanAndFailed(jobs)).toBe(true);
  });

  it("returns true when the curl-based Post-Deploy Smoke Test job fails (no poll step exists there)", () => {
    const jobs = [
      {
        name: "Post-Deploy Smoke Test",
        conclusion: "failure",
        steps: [{ name: "Smoke test deployed sites", conclusion: "failure" }],
      },
    ];
    expect(smokeTestsRanAndFailed(jobs)).toBe(true);
  });

  it("returns true when the API Surface Invariants job fails (no poll step exists there)", () => {
    const jobs = [
      {
        name: "API Surface Invariants",
        conclusion: "failure",
        steps: [{ name: "Probe deployed API surface", conclusion: "failure" }],
      },
    ];
    expect(smokeTestsRanAndFailed(jobs)).toBe(true);
  });

  it("returns true when one job is a poll-timeout-only failure but a sibling job genuinely failed", () => {
    const jobs = [
      {
        name: "Playwright Smoke Tests",
        conclusion: "failure",
        steps: [
          { name: "Poll for deploy to land", conclusion: "failure" },
          { name: "Run smoke tests", conclusion: "skipped" },
        ],
      },
      {
        name: "API Surface Invariants",
        conclusion: "failure",
        steps: [{ name: "Probe deployed API surface", conclusion: "failure" }],
      },
    ];
    expect(smokeTestsRanAndFailed(jobs)).toBe(true);
  });

  it("treats a cancelled 'Run smoke tests' step as not a genuine failure", () => {
    const jobs = [
      {
        name: "Playwright Smoke Tests",
        conclusion: "failure",
        steps: [
          { name: "Poll for deploy to land", conclusion: "failure" },
          { name: "Run smoke tests", conclusion: "cancelled" },
        ],
      },
    ];
    expect(smokeTestsRanAndFailed(jobs)).toBe(false);
  });

  it("degrades to false on non-array input (fails closed)", () => {
    expect(smokeTestsRanAndFailed(undefined)).toBe(false);
    expect(smokeTestsRanAndFailed(null)).toBe(false);
  });
});
