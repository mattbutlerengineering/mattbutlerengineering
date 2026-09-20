import { describe, it, expect } from "vitest";
import { isSupersededByNewRun, planSweep } from "../lib/nightly-compliance-sweep.mjs";

/** Minimal report.md shape matching the real workflow's failure markers. */
function reportWithFailures(names) {
  const lines = ["## Gating scripts", ""];
  for (const name of names) {
    lines.push(`- ✗ \`${name}\` FAILED`, "", "  ```", `  ${name} broke`, "  ```", "");
  }
  return lines.join("\n");
}

describe("isSupersededByNewRun", () => {
  it("is superseded when the old failure set is identical to the new one", () => {
    const older = reportWithFailures(["check-deploy-sha"]);
    const newer = reportWithFailures(["check-deploy-sha"]);

    expect(isSupersededByNewRun(older, newer)).toBe(true);
  });

  it("is superseded when the old failure set is a strict subset of the new one", () => {
    const older = reportWithFailures(["check-deploy-sha"]);
    const newer = reportWithFailures(["check-deploy-sha", "check-api-surface-invariants"]);

    expect(isSupersededByNewRun(older, newer)).toBe(true);
  });

  it("is NOT superseded when the old report has a failure the new run no longer has", () => {
    const older = reportWithFailures(["check-deploy-sha", "check-api-surface-invariants"]);
    const newer = reportWithFailures(["check-deploy-sha"]);

    expect(isSupersededByNewRun(older, newer)).toBe(false);
  });

  it("is NOT superseded when neither report shares any failure", () => {
    const older = reportWithFailures(["apps/rialto-web#test"]);
    const newer = reportWithFailures(["check-deploy-sha"]);

    expect(isSupersededByNewRun(older, newer)).toBe(false);
  });

  it("is NOT superseded when the old report has no extractable failures at all", () => {
    const older = "<!-- nightly-compliance-signature: abc123 -->\n\nsome unrelated text";
    const newer = reportWithFailures(["check-deploy-sha"]);

    expect(isSupersededByNewRun(older, newer)).toBe(false);
  });

  it("is insensitive to volatile tokens like dates and durations, like the underlying signature", () => {
    const older = [
      "## Lint, typecheck, test",
      "",
      "- ✗ `pnpm test` FAILED",
      "",
      "  ```",
      "  Error: Test timed out in 5000ms.",
      "  ```",
    ].join("\n");
    const newer = [
      "## Lint, typecheck, test",
      "",
      "- ✗ `pnpm test` FAILED",
      "",
      "  ```",
      "  Error: Test timed out in 5231ms.",
      "  ```",
    ].join("\n");

    expect(isSupersededByNewRun(older, newer)).toBe(true);
  });
});

describe("planSweep", () => {
  it("returns the numbers of issues superseded by the new report, skipping non-superseded ones", () => {
    const newer = reportWithFailures(["check-deploy-sha", "check-api-surface-invariants"]);
    const candidates = [
      { number: 100, body: reportWithFailures(["check-deploy-sha"]) },
      { number: 101, body: reportWithFailures(["apps/rialto-web#test"]) },
      { number: 102, body: reportWithFailures(["check-api-surface-invariants"]) },
    ];

    expect(planSweep(candidates, newer)).toEqual([100, 102]);
  });

  it("returns an empty array when there are no candidates", () => {
    expect(planSweep([], reportWithFailures(["check-deploy-sha"]))).toEqual([]);
  });
});
