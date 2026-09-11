import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  smokeTestsRanAndFailed,
  isRegressionTransition,
  shouldAutoRevert,
} from "../rollback-smoke-test-gate.mjs";

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

describe("isRegressionTransition", () => {
  const apiSurfaceFailure = {
    name: "API Surface Invariants",
    conclusion: "failure",
    steps: [{ name: "Probe deployed API surface", conclusion: "failure" }],
  };

  it("returns false when the same job was ALREADY failing on the previous run (the standing-red trap)", () => {
    // The real 2026-09-11 incident: `API Surface Invariants` had failed on
    // every deploy since 2026-09-07 (the /public/v1 ingress defect, an
    // infrastructure state problem). Four unrelated commits were blamed.
    const previous = [{ name: "API Surface Invariants", conclusion: "failure", steps: [] }];
    expect(isRegressionTransition([apiSurfaceFailure], previous)).toBe(false);
  });

  it("returns true when the job went success -> failure (a real regression)", () => {
    const previous = [{ name: "API Surface Invariants", conclusion: "success", steps: [] }];
    expect(isRegressionTransition([apiSurfaceFailure], previous)).toBe(true);
  });

  it("returns false when there is no previous run to compare against — fails closed", () => {
    expect(isRegressionTransition([apiSurfaceFailure], [])).toBe(false);
    expect(isRegressionTransition([apiSurfaceFailure], undefined)).toBe(false);
    expect(isRegressionTransition([apiSurfaceFailure], null)).toBe(false);
  });

  it("returns false when the failing job did not exist on the previous run — fails closed", () => {
    const previous = [{ name: "Playwright Smoke Tests", conclusion: "success", steps: [] }];
    expect(isRegressionTransition([apiSurfaceFailure], previous)).toBe(false);
  });

  it("treats a previous cancelled/skipped conclusion as no proof of green — fails closed", () => {
    for (const conclusion of ["cancelled", "skipped", null, undefined]) {
      const previous = [{ name: "API Surface Invariants", conclusion, steps: [] }];
      expect(isRegressionTransition([apiSurfaceFailure], previous)).toBe(false);
    }
  });

  it("returns false when nothing in the current run is a genuine failure", () => {
    const current = [
      {
        name: "Playwright Smoke Tests",
        conclusion: "failure",
        steps: [
          { name: "Poll for deploy to land", conclusion: "failure" },
          { name: "Run smoke tests", conclusion: "skipped" },
        ],
      },
    ];
    const previous = [{ name: "Playwright Smoke Tests", conclusion: "success", steps: [] }];
    expect(isRegressionTransition(current, previous)).toBe(false);
  });

  it("one newly-red job is enough even when another was already red", () => {
    const current = [
      apiSurfaceFailure,
      { name: "Post-Deploy Smoke Test", conclusion: "failure", steps: [] },
    ];
    const previous = [
      { name: "API Surface Invariants", conclusion: "failure", steps: [] },
      { name: "Post-Deploy Smoke Test", conclusion: "success", steps: [] },
    ];
    expect(isRegressionTransition(current, previous)).toBe(true);
  });
});

describe("shouldAutoRevert", () => {
  it("is false for a standing red, even though the smoke gate alone says the failure is genuine", () => {
    const current = [
      {
        name: "API Surface Invariants",
        conclusion: "failure",
        steps: [{ name: "Probe deployed API surface", conclusion: "failure" }],
      },
    ];
    const previous = [{ name: "API Surface Invariants", conclusion: "failure", steps: [] }];
    // The pre-existing gate on its own would have opened the revert PR.
    expect(smokeTestsRanAndFailed(current)).toBe(true);
    expect(shouldAutoRevert(current, previous)).toBe(false);
  });

  it("is true only when the failure is both genuine and newly red", () => {
    const current = [
      {
        name: "Playwright Smoke Tests",
        conclusion: "failure",
        steps: [
          { name: "Poll for deploy to land", conclusion: "success" },
          { name: "Run smoke tests", conclusion: "failure" },
        ],
      },
    ];
    const previous = [{ name: "Playwright Smoke Tests", conclusion: "success", steps: [] }];
    expect(shouldAutoRevert(current, previous)).toBe(true);
  });

  it("is false when the deploy could not be verified, regardless of history", () => {
    const current = [
      {
        name: "Playwright Smoke Tests",
        conclusion: "failure",
        steps: [
          { name: "Poll for deploy to land", conclusion: "failure" },
          { name: "Run smoke tests", conclusion: "skipped" },
        ],
      },
    ];
    const previous = [{ name: "Playwright Smoke Tests", conclusion: "success", steps: [] }];
    expect(shouldAutoRevert(current, previous)).toBe(false);
  });
});

describe("auto-rollback.yml wiring", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/auto-rollback.yml", import.meta.url),
    "utf-8"
  );

  it("gates the revert PR on should_auto_revert, not the smoke gate alone", () => {
    // The conjunction is the whole point: smoke_tests_ran_and_failed answers
    // "is this genuine", never "did this commit cause it". Gating on it alone
    // is what opened five false-positive revert PRs on 2026-09-11.
    const revertCondition = workflow
      .split("\n")
      .find((line) => line.includes("if:") && line.includes("steps.agent-check.outputs.is_agent"));

    expect(revertCondition).toBeDefined();
    expect(revertCondition).toContain("steps.smoke-gate.outputs.should_auto_revert == 'true'");
    expect(revertCondition).not.toContain("smoke_tests_ran_and_failed");
  });

  it("still runs the gate script that produces that output", () => {
    expect(workflow).toContain("node scripts/rollback-smoke-test-gate.mjs --run-id");
  });
});
