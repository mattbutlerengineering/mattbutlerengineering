import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { getJob, jobRunText, loadWorkflow } from "../lib/workflow.mjs";

const WORKFLOW = loadWorkflow("ci.yml");

/**
 * #6887: `pnpm check:knip` must run in a job that CI Gate requires, as a bare
 * command (no pipe) so its exit code is the step's exit code, and without a
 * rialto build (knip.jsonc must not depend on gitignored build output).
 */
describe("ci.yml knip gate", () => {
  it("runs check:knip as a bare command in the static-checks job", () => {
    expect(jobRunText(getJob(WORKFLOW, "static-checks"))).toMatch(/^pnpm check:knip\s*$/m);
  });

  it("static-checks is a required dependency of ci-gate", () => {
    expect(getJob(WORKFLOW, "ci-gate").needs).toContain("static-checks");
  });

  it("does not make the knip step build rialto first", () => {
    const steps = getJob(WORKFLOW, "static-checks").steps;
    const knip = steps.findIndex((s) => /check:knip/.test(s.run ?? ""));
    const before = steps
      .slice(0, knip)
      .map((s) => s.run ?? "")
      .join("\n");
    expect(before).not.toMatch(/build/);
  });

  it("knip.jsonc disables neither workspace-wide nor hides rialto-web: the app entry is explicit", () => {
    const config = readFileSync(new URL("../../knip.jsonc", import.meta.url), "utf-8");
    expect(config).toContain('"src/main.tsx"');
  });
});
