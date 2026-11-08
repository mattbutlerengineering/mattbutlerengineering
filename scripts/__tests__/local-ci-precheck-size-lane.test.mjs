/**
 * #8522: CI's `Check bundle size budgets` step (`pnpm size:check`) was the most
 * frequent failing CI step, and /local-ci-precheck — mandated before every
 * push — never ran it, so each failure cost a CI round-trip. Pin that the
 * precheck keeps an affected-only size:check lane while CI keeps the step.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getJob, getStep, loadWorkflow } from "../lib/workflow.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILL = readFileSync(
  join(REPO_ROOT, ".claude", "skills", "local-ci-precheck", "SKILL.md"),
  "utf8"
);

describe("local-ci-precheck size lane (#8522)", () => {
  it("CI still gates on `pnpm size:check` in the Build job", () => {
    const step = getStep(getJob(loadWorkflow("ci.yml"), "build"), "Check bundle size budgets");
    expect(step.run).toContain("pnpm size:check");
  });

  it("the precheck runs size:check for affected packages only", () => {
    expect(SKILL).toContain("pnpm turbo run size:check --filter='...[origin/main]'");
  });

  it("the precheck waits on the size lane so its failure fails the run", () => {
    expect(SKILL).toMatch(/size_pid=\$!/);
    expect(SKILL).toMatch(/wait \$size_pid \|\| fail=1/);
  });

  it("honours the documented --skip-size flag", () => {
    expect(SKILL).toContain('*" --skip-size "*');
  });
});
