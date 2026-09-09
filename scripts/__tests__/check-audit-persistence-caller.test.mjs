/**
 * Regression test for #4899: `updateSurfaceScore()` / `saveInventory()`
 * (packages/agent-core/src/audit-{regression-detector,inventory-store}.ts)
 * shipped fully implemented and unit-tested but had zero real callers
 * anywhere in the automation surface — the library and its own tests were
 * the only things that ever referenced them, so every audit surface sat at
 * `checkCount: 0` forever despite an active audit loop. See
 * scripts/check-audit-persistence-caller.mjs, and its live caller,
 * scripts/record-audit-check.mjs.
 */

import { describe, it, expect } from "vitest";

import {
  GUARDED_CALLS,
  callsFunction,
  isTestPath,
  findMissingCallers,
  formatFinding,
} from "../check-audit-persistence-caller.mjs";

describe("callsFunction", () => {
  it("matches a real call expression", () => {
    expect(
      callsFunction("const s = updateSurfaceScore(surface, scores);", "updateSurfaceScore")
    ).toBe(true);
  });

  it("does not match a bare mention in a comment or import list", () => {
    expect(callsFunction("// see updateSurfaceScore for details", "updateSurfaceScore")).toBe(
      false
    );
    expect(
      callsFunction('import { updateSurfaceScore } from "@mbe/agent-core";', "updateSurfaceScore")
    ).toBe(false);
  });

  it("does not match a JSDoc/prose mention that happens to include trailing parens", () => {
    // Regression: this check's own module docstring documents the guarded
    // functions as `updateSurfaceScore()` / `saveInventory()` — a naive
    // call-expression regex matches that prose and reports a false PASS
    // even with zero real callers.
    const jsdoc = [
      "/**",
      " * Fails when `updateSurfaceScore()` / `saveInventory()` go back to",
      " * having zero real callers.",
      " */",
    ].join("\n");
    expect(callsFunction(jsdoc, "updateSurfaceScore")).toBe(false);
    expect(callsFunction(jsdoc, "saveInventory")).toBe(false);
  });
});

describe("isTestPath", () => {
  it("treats __tests__ members and *.test.* files as tests", () => {
    expect(isTestPath("scripts/__tests__/record-audit-check.test.mjs")).toBe(true);
    expect(isTestPath("scripts/record-audit-check.test.mjs")).toBe(true);
  });

  it("treats an ordinary script as non-test", () => {
    expect(isTestPath("scripts/record-audit-check.mjs")).toBe(false);
  });
});

describe("findMissingCallers", () => {
  it("reports a guarded function with no real call site outside tests", () => {
    const files = {
      "scripts/a.mjs": `// mentions updateSurfaceScore but never calls it`,
      "scripts/__tests__/a.test.mjs": `updateSurfaceScore(x, y);`,
    };
    const { findings } = findMissingCallers({
      guarded: [{ name: "updateSurfaceScore", reason: "test fixture" }],
      filePaths: Object.keys(files),
      readFile: (p) => files[p],
    });
    expect(findings).toEqual([{ name: "updateSurfaceScore", reason: "test fixture" }]);
  });

  it("passes once a non-test file has a real call site", () => {
    const files = {
      "scripts/record-audit-check.mjs": `saveInventory(repoRoot, next);`,
    };
    const { findings } = findMissingCallers({
      guarded: [{ name: "saveInventory", reason: "test fixture" }],
      filePaths: Object.keys(files),
      readFile: (p) => files[p],
    });
    expect(findings).toEqual([]);
  });
});

describe("formatFinding", () => {
  it("renders name and reason", () => {
    expect(formatFinding({ name: "saveInventory", reason: "writes the inventory" })).toContain(
      "saveInventory"
    );
  });
});

describe("GUARDED_CALLS coverage (live check, not a fixture)", () => {
  it("guards both updateSurfaceScore and saveInventory", () => {
    expect(GUARDED_CALLS.map((g) => g.name).sort()).toEqual([
      "saveInventory",
      "updateSurfaceScore",
    ]);
  });
});
