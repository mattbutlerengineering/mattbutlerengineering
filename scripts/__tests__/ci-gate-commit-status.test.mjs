import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mapOutcomeToCommitStatusState,
  COMMIT_STATUS_STATES,
  isTransientPublishError,
} from "../ci-gate-commit-status.mjs";

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

describe("isTransientPublishError (#4333 follow-up)", () => {
  it("treats a truncated response body as transient", () => {
    // Observed on run 32081722175 (PR #4349): every substantive job passed
    // and OUTCOME was success, but `gh` printed exactly this and the gate
    // job failed. The inline grep #4333 shipped did not match it, so it was
    // classified non-transient and failed fast with no retry.
    expect(isTransientPublishError("unexpected end of JSON input")).toBe(true);
  });

  it("still treats every 5xx as transient", () => {
    for (const code of [500, 502, 503, 504]) {
      expect(isTransientPublishError(`gh: Server Error (HTTP ${code})`)).toBe(true);
    }
  });

  it("still treats network-level failures as transient", () => {
    for (const message of [
      "request timed out",
      "could not connect to api.github.com",
      "connection reset by peer",
      "network is unreachable",
    ]) {
      expect(isTransientPublishError(message)).toBe(true);
    }
  });

  it("never treats a 4xx rejection as transient", () => {
    for (const code of [400, 401, 403, 404, 422]) {
      expect(isTransientPublishError(`gh: Bad request (HTTP ${code})`)).toBe(false);
    }
  });

  it("is case-insensitive", () => {
    expect(isTransientPublishError("UNEXPECTED END OF JSON INPUT")).toBe(true);
    expect(isTransientPublishError("gh: server error (http 503)")).toBe(true);
  });

  it("fails closed on empty or non-string output — unknown is not transient", () => {
    for (const value of ["", null, undefined, 42]) {
      expect(isTransientPublishError(value)).toBe(false);
    }
  });

  it("does not match a 5xx-looking number that is not an HTTP code", () => {
    expect(isTransientPublishError("commit 503abc could not be found")).toBe(false);
  });
});

describe("ci.yml CI Gate job — transient-retry wiring (#4333 follow-up)", () => {
  it("classifies publish failures via the pure module, not an inline regex", () => {
    expect(CI_WORKFLOW).toContain("ci-gate-commit-status.mjs transient");
  });

  it("no longer carries the inline grep that missed the truncated-body case", () => {
    expect(CI_WORKFLOW).not.toContain("network is unreachable'");
  });
});
