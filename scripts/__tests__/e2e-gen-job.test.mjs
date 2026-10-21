import { describe, it, expect } from "vitest";
import { getJob, jobRunText, loadWorkflow } from "../lib/workflow.mjs";

const WORKFLOW = loadWorkflow("e2e.yml");

/**
 * apps/gen's Playwright suite ran nowhere in CI until #7210 (proposal #7063):
 * no workflow invoked it, so it read as covered while pinning nothing.
 */
describe("e2e.yml gen job", () => {
  const job = getJob(WORKFLOW, "gen-e2e");

  it("defines the job, gated on the gen path filter and skipped for Dependabot", () => {
    expect(job).toBeTruthy();
    expect(job.needs).toEqual(["changes"]);
    expect(job.if).toMatch(/needs\.changes\.outputs\.gen == 'true'/);
    expect(job.if).toMatch(/github\.actor != 'dependabot\[bot\]'/);
  });

  it("builds rialto first and runs the gen suite", () => {
    const run = jobRunText(job);
    expect(run).toMatch(/pnpm build --filter @mattbutlerengineering\/rialto/);
    expect(run).toMatch(/pnpm --dir apps\/gen test:e2e/);
  });

  it("is triggered by gen and its shared dependencies", () => {
    const paths = WORKFLOW.on.pull_request.paths;
    for (const p of ["apps/gen/**", "packages/rialto/**", "packages/rialto-catalog/**"]) {
      expect(paths).toContain(p);
    }
  });

  it("forces the gen job on workflow_dispatch", () => {
    const set = getJob(WORKFLOW, "changes").steps.find((s) => s.name === "Set outputs");
    expect(set.run).toMatch(/gen=true/);
  });
});
