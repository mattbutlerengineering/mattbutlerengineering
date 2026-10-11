/**
 * Pins `.github/workflows/instruction-regression.yml` to still invoking the
 * ACMM eval harness (`plugins/acmm/scripts/evals/index.js`) in both arms.
 *
 * Why this file exists: the harness is one of the exercised paths
 * `scripts/check-workflow-paths-coverage.mjs` ALLOWLISTs. The workflow's
 * `paths:` filter covers only CLAUDE.md / AGENTS.md / GEMINI.md, so a change to
 * the harness runs no eval. This test is the compensating control: it reads the
 * real workflow on every PR, so deleting either invocation fails here instead of
 * silently shipping an eval job that no longer evals anything.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const HARNESS = "plugins/acmm/scripts/evals/index.js";
const WORKFLOW = readFileSync(
  resolve(ROOT, ".github/workflows/instruction-regression.yml"),
  "utf8"
);

/** Non-comment lines of the workflow that invoke the harness via node. */
const invocations = WORKFLOW.split("\n")
  .map((line) => line.trim())
  .filter((line) => !line.startsWith("#") && line.startsWith(`node ${HARNESS}`));

describe("instruction-regression.yml eval harness wiring", () => {
  it("the harness it invokes exists", () => {
    expect(existsSync(resolve(ROOT, HARNESS))).toBe(true);
  });

  it("invokes the harness with --dry-run", () => {
    expect(invocations.some((l) => /\s--dry-run(\s|$)/.test(l))).toBe(true);
  });

  it("invokes the harness with --report", () => {
    expect(invocations.some((l) => /\s--report(\s|$)/.test(l))).toBe(true);
  });
});
