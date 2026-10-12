/**
 * Structural guard for .github/workflows/scheduled-issue-completion.yml (#3585).
 *
 * The routine's agent run needs `ANTHROPIC_API_KEY`, and CI is keyless by
 * design (#3585, Option A). The workflow used to decide that inside the
 * `Run agent` step: warn, write `outcome=skipped`, `exit 0`. The job then
 * reported SUCCESS twice a day — sixty consecutive "successes" from
 * 2026-08-23 — for a routine that never once ran.
 *
 * The fix copies docs-audit.yml's preflight pattern (#5458): a job output
 * decides, so the `routine` job reports SKIPPED instead. These tests exist
 * because that distinction is invisible in a green run — the failure mode is
 * silence, not noise.
 *
 * Structural checks on the parsed workflow (scripts/lib/workflow.mjs, #6393),
 * so they survive reformatting of the YAML.
 */

import { describe, it, expect } from "vitest";
import { getJob, jobRunText, loadWorkflow } from "../lib/workflow.mjs";

const WORKFLOW = loadWorkflow("scheduled-issue-completion.yml");

/** One parsed job; fails the test if the workflow no longer declares it. */
function jobOf(name) {
  const job = getJob(WORKFLOW, name);
  expect(job, `scheduled-issue-completion.yml declares a \`${name}\` job`).not.toBeNull();
  return job;
}

describe("scheduled-issue-completion gates its agent run on a job output, not a step guard", () => {
  it("declares a preflight job that publishes whether the credential exists", () => {
    const preflight = jobOf("preflight");
    expect(preflight.outputs).toHaveProperty("has_key");
    const check = preflight.steps.find((step) => step.env.ANTHROPIC_API_KEY);
    expect(check.env.ANTHROPIC_API_KEY).toBe("${{ secrets.ANTHROPIC_API_KEY }}");
    expect(check.run).toContain('echo "has_key=true" >> "$GITHUB_OUTPUT"');
    expect(check.run).toContain('echo "has_key=false" >> "$GITHUB_OUTPUT"');
  });

  it("skips the routine job on a missing credential rather than passing it", () => {
    const routine = jobOf("routine");
    expect(routine.needs).toEqual(["preflight"]);
    expect(routine.if).toMatch(/needs\.preflight\.outputs\.has_key == 'true'/);
  });

  it("keeps the old silent-skip out of the step — an exit 0 there reads as a pass", () => {
    const routine = jobOf("routine");
    const scripts = jobRunText(routine);
    expect(scripts).not.toMatch(/ANTHROPIC_API_KEY is not configured/);
    expect(scripts).not.toMatch(/exit 0/);
    expect(scripts).not.toMatch(/outcome=skipped/);
  });

  it("says in the run summary that the routine did not run, so a skip is legible", () => {
    const preflight = jobOf("preflight");
    expect(jobRunText(preflight)).toContain("$GITHUB_STEP_SUMMARY");
    expect(jobRunText(preflight)).toMatch(/#3585/);
  });

  it("still invokes the built CLI entrypoint when a credential exists", () => {
    // The @mbe/cli bin is never linked into node_modules/.bin (gotchas § Build),
    // so `pnpm exec mbe` cannot resolve — the built entrypoint is the only path.
    const routine = jobOf("routine");
    const scripts = jobRunText(routine);
    expect(scripts).toContain("pnpm build --filter @mbe/cli...");
    expect(scripts).toContain("node tools/cli/dist/index.js agent run");
    expect(scripts).not.toContain("pnpm exec mbe");
  });
});
