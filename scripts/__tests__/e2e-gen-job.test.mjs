import { describe, it, expect } from "vitest";
import { E2E_SUITE_FILTERS } from "../e2e-changed-suites.mjs";
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

  // The workflow runs for every PR after CI Gate (#9834, #10025); the `changes`
  // job's gen filter (scripts/e2e-changed-suites.mjs) decides.
  it("runs for gen and its shared dependencies", () => {
    for (const p of ["apps/gen/", "packages/rialto/", "packages/rialto-catalog/"]) {
      expect(E2E_SUITE_FILTERS.gen).toContain(p);
    }
  });

  it("forces every suite, gen included, on a manual dispatch with no head_sha", () => {
    const set = getJob(WORKFLOW, "changes").steps.find((s) => s.name === "Detect changed suites");
    expect(set.run).toContain("e2e-changed-suites.mjs all");
  });
});
