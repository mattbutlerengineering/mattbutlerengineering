import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mapOutcomeToCommitStatusState, COMMIT_STATUS_STATES } from "../ci-gate-commit-status.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const CI_WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");

describe("mapOutcomeToCommitStatusState", () => {
  it("maps a successful step outcome to the success state", () => {
    expect(mapOutcomeToCommitStatusState("success")).toBe("success");
  });

  it("maps a failed step outcome to the failure state", () => {
    expect(mapOutcomeToCommitStatusState("failure")).toBe("failure");
  });

  it("maps a cancelled step outcome to error, never success", () => {
    expect(mapOutcomeToCommitStatusState("cancelled")).toBe("error");
  });

  it("fails closed on an unrecognized outcome, never reporting success", () => {
    expect(mapOutcomeToCommitStatusState("skipped")).toBe("error");
    expect(mapOutcomeToCommitStatusState("")).toBe("error");
    expect(mapOutcomeToCommitStatusState(undefined)).toBe("error");
  });

  it("only ever emits a documented commit-status state", () => {
    for (const outcome of ["success", "failure", "cancelled", "skipped", "bogus"]) {
      expect(COMMIT_STATUS_STATES).toContain(mapOutcomeToCommitStatusState(outcome));
    }
  });
});

describe("ci.yml CI Gate job — commit-status publish wiring (#4025)", () => {
  it("publishes a commit status named 'CI Gate' via the GitHub statuses API", () => {
    expect(CI_WORKFLOW).toMatch(/statuses\/\$\{?SHA\}?/);
    expect(CI_WORKFLOW).toMatch(/context=["']CI Gate["']/);
  });

  it("runs the publish step unconditionally (if: always()) so red/cancelled CI is reported too", () => {
    const publishStepIndex = CI_WORKFLOW.indexOf("- name: Publish CI Gate commit status");
    expect(publishStepIndex).toBeGreaterThan(-1);
    const stepBlock = CI_WORKFLOW.slice(publishStepIndex, publishStepIndex + 1400);
    expect(stepBlock).toMatch(/if:\s*always\(\)/);
  });

  it("computes the status state via the pure ci-gate-commit-status.mjs mapping", () => {
    expect(CI_WORKFLOW).toContain("scripts/ci-gate-commit-status.mjs");
  });
});
