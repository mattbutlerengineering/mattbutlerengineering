import { describe, it, expect } from "vitest";
import { load as loadYaml } from "js-yaml";
import { readFileSync } from "node:fs";
import { loadWorkflow, getJob } from "../lib/workflow.mjs";

/**
 * #6567: apps/rialto-web/src/data/page-registry.ts imports
 * scripts/ui-quality/derive-path.mjs at runtime, so an edit to that file alone
 * changes the built site. deploy-static's path filters listed only apps/* and
 * packages/*, so such a push redeployed nothing and the sitemap (marketing)
 * and the router (rialto-web) drifted apart.
 */
const IMPORTED_SCRIPT = "scripts/ui-quality/derive-path.mjs";

/** Glob → regex: escape every regex metacharacter, then map escaped `*`/`**` to `.*`. */
const globToRegExp = (glob) =>
  new RegExp(`^${glob.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/(?:\\\*){1,2}/g, ".*")}$`);

const matches = (patterns, file) => patterns.some((p) => globToRegExp(p).test(file));

describe("deploy-static covers scripts/ files the apps import at runtime", () => {
  const workflow = loadWorkflow("deploy-static.yml");

  it("push trigger paths include the imported script", () => {
    expect(matches(workflow.on.push.paths, IMPORTED_SCRIPT)).toBe(true);
  });

  it("the rialto-web change filter includes the imported script", () => {
    const job = getJob(workflow, "detect-changes");
    const step = job.steps.find((s) => s.id === "filter");
    const filters = loadYaml(step.with.filters);
    expect(matches(filters["rialto-web"], IMPORTED_SCRIPT)).toBe(true);
  });

  it("the file is really imported by rialto-web (the test is not vacuous)", () => {
    const src = readFileSync("apps/rialto-web/src/data/page-registry.ts", "utf8");
    expect(src).toContain(IMPORTED_SCRIPT);
  });
});
