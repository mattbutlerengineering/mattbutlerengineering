import { describe, it, expect } from "vitest";
import { getJob, loadWorkflow } from "../lib/workflow.mjs";

const WORKFLOW = loadWorkflow("ci.yml");

/**
 * `pnpm repo-audit`'s prettier check took 41s of the Build job on main run
 * 37527830915. Prettier's cache (on by default, node_modules/.cache/prettier)
 * cuts a warm run to ~1s locally, but the node_modules cache only saves on a
 * lockfile miss, so CI never kept it. The cache is keyed on file content: a
 * file whose content changed with its mtime held is still re-checked (measured
 * 2026-10-06), so restoring an older commit's cache cannot false-pass a PR.
 * The key still rotates on the lockfile (prettier version, plugins) and on
 * the prettier config, so a formatting-rule change never reuses old verdicts.
 */
describe("ci.yml Build prettier cache", () => {
  const build = getJob(WORKFLOW, "build");
  const cacheIndex = build.steps.findIndex((s) =>
    /node_modules\/\.cache\/prettier/.test(String(s.with.path ?? ""))
  );
  const cacheStep = build.steps[cacheIndex];

  it("restores prettier's cache in the Build job", () => {
    expect(cacheStep, "no cache step for node_modules/.cache/prettier").toBeDefined();
  });

  it("keys it on the lockfile and the prettier config", () => {
    expect(cacheStep.with.key).toMatch(/hashFiles\([^)]*pnpm-lock\.yaml/);
    expect(cacheStep.with.key).toMatch(/hashFiles\([^)]*\.prettierrc\.js/);
    expect(cacheStep.with.key).toMatch(/hashFiles\([^)]*\.prettierignore/);
  });

  it("restores it before the repo audit runs", () => {
    expect(cacheIndex).toBeGreaterThan(-1);
    const auditIndex = build.steps.findIndex((s) => /pnpm repo-audit/.test(s.run ?? ""));
    expect(auditIndex).toBeGreaterThan(-1);
    expect(cacheIndex).toBeLessThan(auditIndex);
  });
});
