import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { getJob, getStep, loadWorkflow } from "../lib/workflow.mjs";

/** #9069: ratchet + migration check live in pre-commit/CI, not pre-push. */
describe("pre-push trim (#9069)", () => {
  const prePush = readFileSync(".husky/pre-push", "utf8");
  const code = prePush
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
  it("does not run the antipattern ratchet or destructive-migration check", () => {
    expect(code).not.toContain("check-ai-antipatterns");
    expect(code).not.toContain("check-destructive-migrations");
  });
  it("keeps the ratchet in pre-commit", () => {
    expect(readFileSync(".husky/pre-commit", "utf8")).toContain("check-ai-antipatterns.mjs");
  });
});

/** #9061: screenshots never run on PR branches. */
describe("e2e-screenshots trigger (#9061)", () => {
  it("triggers on main pushes and dispatch only", () => {
    const wf = loadWorkflow("e2e-screenshots.yml");
    const on = wf.on ?? wf[true];
    expect(Object.keys(on).sort()).toEqual(["push", "workflow_dispatch"]);
    expect(on.push.branches).toEqual(["main"]);
  });
});

/** #9064: over-cap diffs fall back to local git instead of skipping. */
describe("auto-review large-diff fallback (#9064)", () => {
  const job = getJob(loadWorkflow("auto-review.yml"), "review");
  it("falls back to local git for non-deleted, non-generated files", () => {
    const run = getStep(job, "Get changed files").run;
    expect(run).toContain("--diff-filter=d");
    expect(run).toContain("large_fallback=true");
    expect(run).toContain("/tmp/large-pr.patch");
  });
  it("review step reads the fallback patch", () => {
    expect(getStep(job, "Run review checks").run).toContain("cat /tmp/large-pr.patch");
  });
  it("the residual skip comment demands human review", () => {
    expect(getStep(job, "Post diff-too-large comment").run).toContain("REQUIRED");
  });
});
