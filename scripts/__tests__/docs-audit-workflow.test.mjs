/**
 * Structural guard for .github/workflows/docs-audit.yml (#5458).
 *
 * The workflow has two halves. The mechanical one repairs links and directory
 * trees; the semantic one is the only half that checks whether a prose claim is
 * still TRUE, and it needs `ANTHROPIC_API_KEY`, which this repo does not have
 * (#3585).
 *
 * That was originally decided inside the step: warn, `exit 0`. The job then
 * reported SUCCESS, so five consecutive weekly runs (2026-08-18 through
 * 2026-09-15) were indistinguishable from five real documentation audits —
 * "Run the /md-audit pass: success" in every one, with the agent never
 * invoked. The absence only surfaced by reading a job log by hand.
 *
 * The fix moves the decision into a job output so the semantic job reports
 * SKIPPED instead. These tests exist because that distinction is invisible in
 * a green run: nothing else in the repo would notice the guard sliding back
 * into the step, and the failure mode is silence, not noise.
 *
 * Structural checks on the parsed workflow (scripts/lib/workflow.mjs, #6393),
 * so they survive reformatting of the YAML.
 */

import { describe, it, expect } from "vitest";
import { getJob, jobEnvNames, jobRunText, loadWorkflow } from "../lib/workflow.mjs";

const WORKFLOW = loadWorkflow("docs-audit.yml");

/** One parsed job; fails the test if the workflow no longer declares it. */
function jobBlock(name) {
  const job = getJob(WORKFLOW, name);
  expect(job, `docs-audit.yml declares a \`${name}\` job`).not.toBeNull();
  return job;
}

describe("docs-audit gates its semantic pass on a job output, not a step guard", () => {
  it("declares a preflight job that publishes whether the credential exists", () => {
    const preflight = jobBlock("preflight");
    expect(preflight.outputs).toHaveProperty("has_key");
    const check = preflight.steps.find((step) => step.env.ANTHROPIC_API_KEY);
    expect(check.env.ANTHROPIC_API_KEY).toBe("${{ secrets.ANTHROPIC_API_KEY }}");
    expect(check.run).toContain('echo "has_key=true" >> "$GITHUB_OUTPUT"');
    expect(check.run).toContain('echo "has_key=false" >> "$GITHUB_OUTPUT"');
  });

  it("skips the semantic job on a missing credential rather than passing it", () => {
    const semantic = jobBlock("semantic");
    expect(semantic.needs).toEqual(["preflight"]);
    expect(semantic.if).toMatch(/needs\.preflight\.outputs\.has_key == 'true'/);
  });

  it("keeps the old silent-skip out of the step — an exit 0 there reads as a pass", () => {
    const semantic = jobBlock("semantic");
    expect(jobRunText(semantic)).not.toMatch(/ANTHROPIC_API_KEY is not configured/);
    expect(jobRunText(semantic)).not.toMatch(/exit 0/);
  });

  it("says in the run summary that no prose claim was checked, so a skip is legible", () => {
    const preflight = jobBlock("preflight");
    expect(jobRunText(preflight)).toContain("$GITHUB_STEP_SUMMARY");
    expect(jobRunText(preflight)).toMatch(/#3585/);
  });

  it("leaves the mechanical half independent of the credential", () => {
    // The workflow's own header promises the link fixes never wait on an agent.
    const mechanical = jobBlock("mechanical");
    expect(mechanical.needs).not.toContain("preflight");
    expect(jobEnvNames(mechanical)).not.toContain("ANTHROPIC_API_KEY");
    expect(jobRunText(mechanical)).not.toMatch(/ANTHROPIC_API_KEY/);
  });

  it("runs the agent step under pipefail, so a failure inside it fails the job", () => {
    // GitHub's default shell is `bash -e` with no pipefail (gotchas § CI).
    const semantic = jobBlock("semantic");
    expect(jobRunText(semantic)).toMatch(/set -euo pipefail/);
  });
});
