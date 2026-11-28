import { describe, it, expect } from "vitest";
import { getJob, loadWorkflow } from "../lib/workflow.mjs";

/**
 * #9924: `scripts/check-ready-label-exclusive.mjs` queries live GitHub state
 * through `gh`. Without a token in the Build job's repo-audit step it can only
 * resolve on a developer machine, so two violations accumulated unseen (#9923).
 * A job-level `permissions:` block replaces the workflow default, so
 * `contents: read` must be restated alongside `issues: read`.
 */
describe("ci.yml Build ready-label exclusivity gate", () => {
  const build = getJob(loadWorkflow("ci.yml"), "build");
  const audit = build.steps.find((s) => /pnpm repo-audit/.test(s.run ?? ""));

  it("grants only contents: read and issues: read to the Build job", () => {
    expect(build.permissions).toEqual({ contents: "read", issues: "read" });
  });

  it("passes GITHUB_TOKEN as GH_TOKEN to the repo audit step", () => {
    expect(audit, "no pnpm repo-audit step").toBeDefined();
    expect(audit.env?.GH_TOKEN).toBe("${{ secrets.GITHUB_TOKEN }}");
  });
});
