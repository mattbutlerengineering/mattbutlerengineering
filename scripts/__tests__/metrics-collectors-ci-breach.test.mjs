/**
 * ADR-036: the daily metrics-collectors run turns a push -> CI Gate p90 breach
 * into one deduped, never-`ready` `ci-fix` issue. Text/structure guard on the
 * real workflow, matching metrics-collectors-workflow.test.mjs.
 */

import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getJob, getStep, loadWorkflow } from "../lib/workflow.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const job = getJob(
  loadWorkflow(resolve(ROOT, ".github/workflows/metrics-collectors.yml")),
  "collect"
);
const STEP_NAME = "File CI push-to-gate breach issue";

describe("metrics-collectors files the ADR-036 breach issue", () => {
  const recordAt = job.steps.findIndex((s) => s.name === "Collect SDLC speed sensor row");
  const stepAt = job.steps.findIndex((s) => s.name === STEP_NAME);

  it("runs right after the SDLC speed record step and before the push", () => {
    expect(recordAt).toBeGreaterThan(-1);
    expect(stepAt).toBeGreaterThan(recordAt);
    expect(stepAt).toBeLessThan(
      job.steps.findIndex((s) => s.name === "Push metrics to metrics-data")
    );
  });

  it("keeps the record step's JSON for the breach step to read", () => {
    expect(job.steps[recordAt].run).toMatch(
      /tee -a "\$GITHUB_STEP_SUMMARY" "\$RUNNER_TEMP\/sdlc-speed\.json"/
    );
  });

  it("acts only on absoluteBreach, with pipefail, a token, and the dedupe key", () => {
    const step = getStep(job, STEP_NAME);
    expect(step.env.GH_TOKEN).toBe("${{ secrets.GITHUB_TOKEN }}");
    expect(step.run).toMatch(/set -o pipefail/);
    expect(step.run).toMatch(/\.absoluteBreach/);
    expect(step.run).toMatch(/--dedupe-key "ci-push-to-gate-p90"/);
    expect(step.run).toMatch(/--label "ci-fix"/);
    expect(step.run).toMatch(/--comment-body-file/);
    expect(step.run).toContain("over the 15 min target (ADR-036)");
    expect(step.run).toContain("issues/10009");
  });

  it("never labels the issue `ready`", () => {
    const run = getStep(job, STEP_NAME).run;
    expect(run).not.toMatch(/--label\s+"?ready"(?!-)|--label\s+ready(?![-\w])/);
  });
});
