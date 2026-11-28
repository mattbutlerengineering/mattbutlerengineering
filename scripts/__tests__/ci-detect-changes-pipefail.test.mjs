import { describe, it, expect } from "vitest";
import { getJob, getStep, loadWorkflow } from "../lib/workflow.mjs";

const CI = loadWorkflow("ci.yml");

/**
 * Change detection runs as the first step of `prepare` (#10064: it was its own
 * `detect-changes` job, which cost a whole queued hop on the required path).
 * A failing `git diff` must fail the step, never fall through to has_code=false
 * and skip CI.
 */
describe("ci.yml change detection fail-closed", () => {
  const step = getStep(getJob(CI, "prepare"), "Check for code changes");

  it("enables errexit and pipefail before the git diff, so a failing diff fails the job", () => {
    const run = step.run;
    const setIdx = run.search(/^\s*set -euo pipefail\s*$/m);
    const diffIdx = run.search(/^\s*CODE_CHANGES=.*git diff/m);
    expect(setIdx).toBeGreaterThanOrEqual(0);
    expect(diffIdx).toBeGreaterThan(setIdx);
  });

  it("is never conditional, so has_code is always set", () => {
    expect(step.if).toBeNull();
    expect(step["continue-on-error"]).toBeUndefined();
  });
});
