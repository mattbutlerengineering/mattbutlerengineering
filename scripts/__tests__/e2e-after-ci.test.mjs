import { describe, it, expect } from "vitest";
import { getJob, getStep, jobRunText, loadWorkflow } from "../lib/workflow.mjs";
import { suitesForPaths, E2E_SUITE_FILTERS } from "../e2e-changed-suites.mjs";
import { describeResult, mapResultToState } from "../e2e-commit-status.mjs";

/**
 * Advisory E2E starts only after the push's `CI Gate` passes (#10025, parent
 * #10009). E2E needs PR code AND Auth0 secrets, so the design is: a tiny
 * `workflow_run` dispatcher that never touches PR code, and `e2e.yml` run by
 * `workflow_dispatch` on the branch ref (the same secrets context as a push to
 * a branch in this repo). No job waits on CI holding a runner.
 */
const DISPATCHER = loadWorkflow("e2e-after-ci.yml");
const E2E = loadWorkflow("e2e.yml");
const dispatch = getJob(DISPATCHER, "dispatch");

describe("e2e-after-ci.yml dispatcher", () => {
  it("triggers only on completed CI runs", () => {
    expect(Object.keys(DISPATCHER.on)).toEqual(["workflow_run"]);
    expect(DISPATCHER.on.workflow_run.workflows).toEqual(["CI"]);
    expect(DISPATCHER.on.workflow_run.types).toEqual(["completed"]);
  });

  it("runs only for a successful pull_request CI run from this repo", () => {
    expect(dispatch.if).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(dispatch.if).toContain("github.event.workflow_run.event == 'pull_request'");
    expect(dispatch.if).toContain(
      "github.event.workflow_run.head_repository.full_name == github.repository"
    );
    expect(dispatch.if).toContain("github.event.workflow_run.actor.login != 'dependabot[bot]'");
  });

  it("never checks out or runs PR code", () => {
    for (const step of dispatch.steps) {
      expect(step.uses ?? "").not.toMatch(/checkout/);
    }
    expect(jobRunText(dispatch)).not.toMatch(/git (checkout|clone|fetch)|pnpm|npm |npx/);
  });

  it("needs actions: write and nothing else writable", () => {
    expect(dispatch.permissions).toEqual({ actions: "write" });
    expect(DISPATCHER.permissions).toEqual({});
  });

  it("passes event fields through env, never interpolated into the shell", () => {
    expect(jobRunText(dispatch)).not.toContain("${{");
  });

  it("dispatches e2e.yml on the PR branch with the PR number and head SHA", () => {
    const run = jobRunText(dispatch);
    expect(run).toContain("gh workflow run e2e.yml");
    expect(run).toContain("--ref");
    expect(run).toContain("pr_number=");
    expect(run).toContain("head_sha=");
  });

  it("holds no runner waiting for CI", () => {
    expect(jobRunText(dispatch)).not.toMatch(/sleep|--watch|gh run watch/);
    expect(dispatch["timeout-minutes"]).toBeLessThanOrEqual(5);
  });
});

describe("e2e.yml runs after CI Gate, by dispatch", () => {
  it("has no pull_request or pull_request_target trigger", () => {
    expect(E2E.on.pull_request).toBeUndefined();
    expect(E2E.on.pull_request_target).toBeUndefined();
    expect(E2E.on.workflow_dispatch).toBeDefined();
  });

  it("takes the PR number and head SHA as dispatch inputs", () => {
    const { inputs } = E2E.on.workflow_dispatch;
    expect(Object.keys(inputs)).toEqual(["pr_number", "head_sha"]);
    for (const input of Object.values(inputs)) expect(input.required).toBe(false);
  });

  it("reads nothing from a pull_request event", () => {
    const text = JSON.stringify(E2E);
    expect(text).not.toContain("github.event.pull_request");
    expect(text).not.toContain("github.head_ref");
  });

  it("cancels the older dispatched run for the same PR", () => {
    const text = loadWorkflowText();
    expect(text).toMatch(
      /^concurrency:\n {2}group: e2e-\$\{\{ inputs\.pr_number \|\| github\.ref \}\}\n {2}cancel-in-progress: true$/m
    );
  });

  it("diffs the dispatched ref against main in the changes job", () => {
    const changes = getJob(E2E, "changes");
    expect(getStep(changes, "Detect changed suites").run).toContain("e2e-changed-suites.mjs diff");
    expect(changes.steps[0].with["fetch-depth"]).toBe(0);
  });

  it("publishes a commit status per suite on the head SHA", () => {
    const publishers = [
      ["changes", "Publish pending and skipped suite statuses"],
      ["hospitality-e2e-result", "Publish Hospitality E2E commit status"],
      ["marketing-e2e", "Publish Marketing E2E commit status"],
      ["gen-e2e", "Publish Gen E2E commit status"],
    ];
    for (const [jobId, stepName] of publishers) {
      const job = getJob(E2E, jobId);
      expect(job.permissions.statuses, jobId).toBe("write");
      const step = getStep(job, stepName);
      expect(step.run, jobId).toContain("e2e-commit-status.mjs");
      expect(step.run, jobId).toContain("/statuses/");
      expect(step.env.SHA, jobId).toBe("${{ inputs.head_sha }}");
    }
  });
});

describe("e2e-changed-suites", () => {
  it("un-skips only the suites a path touches", () => {
    expect(suitesForPaths(["apps/marketing/src/a.tsx"])).toEqual({
      hospitality: false,
      marketing: true,
      gen: false,
    });
    expect(suitesForPaths(["services/users/src/x.ts"]).hospitality).toBe(true);
    expect(suitesForPaths(["docs/readme.md"])).toEqual({
      hospitality: false,
      marketing: false,
      gen: false,
    });
  });

  it("un-skips everything on a rialto change and on its own workflows", () => {
    expect(Object.values(suitesForPaths(["packages/rialto/src/a.ts"]))).toEqual([true, true, true]);
    expect(Object.values(suitesForPaths([".github/workflows/e2e.yml"]))).toEqual([
      true,
      true,
      true,
    ]);
    expect(Object.values(suitesForPaths([".github/workflows/e2e-after-ci.yml"]))).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("matches exact files exactly, not as prefixes", () => {
    expect(suitesForPaths(["scripts/check-endpoint.mjs.bak"]).hospitality).toBe(false);
    expect(suitesForPaths(["scripts/check-endpoint.mjs"]).hospitality).toBe(true);
  });

  it("covers the per-suite filters", () => {
    expect(Object.keys(E2E_SUITE_FILTERS)).toEqual(["hospitality", "marketing", "gen"]);
  });
});

describe("e2e-commit-status", () => {
  it("maps results to commit-status states, failing closed", () => {
    expect(mapResultToState("success")).toBe("success");
    expect(mapResultToState("failure")).toBe("failure");
    expect(mapResultToState("pending")).toBe("pending");
    expect(mapResultToState("skipped")).toBe("success");
    expect(mapResultToState("cancelled")).toBe("error");
    expect(mapResultToState("")).toBe("error");
    expect(mapResultToState("mystery")).toBe("error");
  });

  it("describes skipped suites as skipped, not passed", () => {
    expect(describeResult("Gen", "skipped")).toBe("Gen E2E skipped: no relevant changes");
    expect(describeResult("Gen", "failure")).toBe("Gen E2E failed");
  });
});

import { readFileSync } from "node:fs";
function loadWorkflowText() {
  return readFileSync(new URL("../../.github/workflows/e2e.yml", import.meta.url), "utf8");
}
