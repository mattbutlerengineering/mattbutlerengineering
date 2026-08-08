import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const WORKFLOW_PATH = resolve(REPO_ROOT, ".github/workflows/rialto-web-e2e.yml");

// Regression test for #3955: apps/rialto-web/e2e/ held six Playwright specs
// that only ever ran locally — rialto-web-visual.yml scoped itself to
// visual.spec.ts alone, so the other five (real assertions, zero CI
// enforcement) could regress silently forever. This test makes that class
// of gap structurally impossible to reintroduce: any e2e/*.spec.ts file
// that isn't named literally in rialto-web-e2e.yml fails `pnpm test`.
describe("rialto-web e2e workflow coverage", () => {
  it("every e2e/*.spec.ts file is referenced by the CI workflow", () => {
    const specs = readdirSync(__dirname).filter((f) => f.endsWith(".spec.ts"));
    const workflow = readFileSync(WORKFLOW_PATH, "utf8");

    // Match the full relative path, not the bare filename — a bare-filename
    // match would false-pass "theme.spec.ts" against an unrelated
    // "renamed-theme.spec.ts" reference elsewhere in the workflow.
    const uncovered = specs.filter((spec) => !workflow.includes(`apps/rialto-web/e2e/${spec}`));

    expect(
      uncovered,
      `e2e specs not referenced by ${WORKFLOW_PATH}: ${uncovered.join(", ")}. ` +
        "Add the spec to the workflow's explicit list, or delete it if obsolete."
    ).toEqual([]);
  });
});
