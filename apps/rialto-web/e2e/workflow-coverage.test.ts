import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const WORKFLOW_PATH = resolve(REPO_ROOT, ".github/workflows/rialto-web-e2e.yml");
const PLAYWRIGHT_CONFIG_PATH = resolve(__dirname, "../playwright.config.ts");

const VISUAL_SPEC = "visual.spec.ts";
const CSP_SPEC = "csp.spec.ts";

// Regression test for #3955 (specs that only ever ran locally) and #8723
// (the explicit spec list was a merge-conflict hotspot). The functional job
// now computes its list at run time: every e2e/*.spec.ts except the two
// that have their own job/step. The guarantee this test preserves is the
// same as before — no spec is silently skipped — but it is now asserted on
// the *contract* (glob + exactly two named exclusions), not on a name list.

const workflow = readFileSync(WORKFLOW_PATH, "utf8");

/** The `run:` script of the functional job's "Run functional e2e tests" step. */
function functionalStepScript(): string {
  const start = workflow.indexOf("- name: Run functional e2e tests");
  expect(start, "functional step not found in workflow").toBeGreaterThan(-1);
  const rest = workflow.slice(start + 1);
  const next = rest.search(/\n {6}- name: /);
  return next === -1 ? rest : rest.slice(0, next);
}

/** Basenames the functional step excludes from its computed glob. */
function functionalExclusions(script: string): string[] {
  const match = script.match(/case "\$\(basename "\$spec"\)" in\s*\n\s*([^)\n]+)\)\s*continue/);
  expect(match, "functional step has no `case … continue` exclusion list").not.toBeNull();
  return (match?.[1] ?? "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .sort();
}

describe("rialto-web e2e workflow coverage", () => {
  const specs = readdirSync(__dirname)
    .filter((f) => f.endsWith(".spec.ts"))
    .sort();

  it("the functional step computes its list from the e2e/*.spec.ts glob", () => {
    const script = functionalStepScript();
    expect(script).toContain("apps/rialto-web/e2e/*.spec.ts");
    expect(script).toContain("--config apps/rialto-web/playwright.config.ts");
    // Fails loudly rather than running Playwright with no spec arguments
    // (which would fall back to the whole directory, visual spec included).
    expect(script).toMatch(/\$\{#specs\[@\]\}"? -eq 0 \]/);
    expect(script).toMatch(/exit 1/);
  });

  it("the functional step excludes exactly the visual and csp specs", () => {
    expect(functionalExclusions(functionalStepScript())).toEqual([CSP_SPEC, VISUAL_SPEC].sort());
  });

  it("the functional step does not enumerate individual specs again", () => {
    const named = specs.filter((s) => functionalStepScript().includes(`e2e/${s}`));
    expect(
      named,
      `functional step names specs explicitly (${named.join(", ")}) — that list is a ` +
        "merge-conflict hotspot (#8723); rely on the computed glob"
    ).toEqual([]);
  });

  it("each excluded spec is run by its own job/step", () => {
    expect(workflow).toMatch(
      /pnpm exec playwright test [^\n]*--config apps\/rialto-web\/playwright\.config\.ts apps\/rialto-web\/e2e\/visual\.spec\.ts/
    );
    expect(workflow).toMatch(
      /pnpm exec playwright test --config apps\/rialto-web\/playwright\.csp\.config\.ts apps\/rialto-web\/e2e\/csp\.spec\.ts/
    );
    // The base config must keep ignoring csp.spec.ts (it would prove nothing
    // under the dev server), or the functional glob above would be wrong.
    expect(readFileSync(PLAYWRIGHT_CONFIG_PATH, "utf8")).toMatch(
      /testIgnore:\s*"\*\*\/csp\.spec\.ts"/
    );
  });

  it("no spec file falls outside visual, csp, or the functional glob", () => {
    const excluded = new Set(functionalExclusions(functionalStepScript()));
    const functional = specs.filter((s) => !excluded.has(s));
    const dropped = specs.filter(
      (s) => s !== VISUAL_SPEC && s !== CSP_SPEC && !functional.includes(s)
    );

    expect(dropped).toEqual([]);
    expect(functional.length).toBeGreaterThan(0);
    // Both exclusions refer to specs that really exist: a rename of either
    // must update the workflow, or it would silently join the functional run.
    expect(specs).toContain(VISUAL_SPEC);
    expect(specs).toContain(CSP_SPEC);
  });
});
