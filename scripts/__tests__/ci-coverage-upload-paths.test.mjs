import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorkflow, getJob, getStep } from "../lib/workflow.mjs";

/**
 * #6496: ci.yml's codecov upload listed packages/rialto/coverage/coverage-final.json
 * although rialto had no `test:coverage` script, so the file was never produced.
 * Every uploaded path must belong to a package whose `test:coverage` script
 * exists (so `pnpm turbo test:coverage` actually writes it), and rialto + config
 * must be in the list.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// WO-0057 (ci-test-matrix-split) renamed `test`'s own "Upload coverage
// reports" step to a per-leg raw-artifact upload (`with.path`, not
// `with.files`) and moved the codecov step this suite actually targets to
// `test-coverage-gate` (WO-0058).
const step = getStep(
  getJob(loadWorkflow("ci.yml"), "test-coverage-gate"),
  "Upload coverage reports"
);
const codecovStep = typeof step.with.files === "string" ? step : null;
const uploaded = codecovStep
  ? codecovStep.with.files
      .split(",")
      .map((p) => p.trim().replace(/^\.\//, ""))
      .filter(Boolean)
  : [];

describe.skipIf(!codecovStep)("ci.yml Upload coverage reports", () => {
  it.each(uploaded)("%s belongs to a package that defines test:coverage", (file) => {
    const dir = file.replace(/\/coverage\/coverage-final\.json$/, "");
    const pkgPath = resolve(ROOT, dir, "package.json");
    expect(existsSync(pkgPath)).toBe(true);
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    expect(pkg.scripts?.["test:coverage"]).toBeTruthy();
  });

  it("includes the rialto and config coverage reports", () => {
    expect(uploaded).toEqual(
      expect.arrayContaining([
        "packages/rialto/coverage/coverage-final.json",
        "packages/config/coverage/coverage-final.json",
      ])
    );
  });
});
