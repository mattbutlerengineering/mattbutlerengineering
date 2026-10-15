/**
 * Contract + unit tests for the pre-commit llms.txt regen-and-stage step
 * (#6633).
 *
 * `.husky/post-commit` used to run `pack-changed --mode commit` AFTER the
 * commit landed, leaving llms.txt/llms-full.txt dirty until an amend or a
 * follow-up commit — and never touched the root llms.txt at all, so it went
 * stale until `.husky/pre-push`'s `pnpm regen --check --git-only` rejected
 * the push. This moves that work into `.husky/pre-commit`, scoped to the
 * files actually staged for the commit, via
 * `scripts/precommit-llms-stage.mjs` (reusing `familiesForChangedFile()`
 * from regen-manifest.mjs rather than a new mechanism).
 *
 * Following `precommit-check-adr.test.mjs`'s pattern: a static contract test
 * on the hook script plus focused unit tests on the pure/injectable pieces,
 * rather than a full temp-worktree integration test (the hook ultimately
 * shells out to a built CLI, which is expensive to exercise per-test).
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  selectLlmsFamilies,
  pkgDirFromOutputs,
  runPrecommitLlmsStage,
} from "../precommit-llms-stage.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const PRE_COMMIT_PATH = resolve(ROOT, ".husky/pre-commit");
const PRE_COMMIT = readFileSync(PRE_COMMIT_PATH, "utf8");

describe(".husky/pre-commit contract", () => {
  it("regenerates and stages llms artifacts for staged files", () => {
    expect(PRE_COMMIT).toMatch(/precommit-llms-stage\.mjs/);
  });

  it("runs the AI antipattern ratchet at commit time, not just push time", () => {
    expect(PRE_COMMIT).toMatch(/check-ai-antipatterns\.mjs/);
  });

  it("no longer defers to a post-commit hook", () => {
    expect(existsSync(resolve(ROOT, ".husky/post-commit"))).toBe(false);
  });
});

describe("selectLlmsFamilies", () => {
  it("scopes a package source edit to that package's llms-txt family (warn-mode only)", () => {
    const families = selectLlmsFamilies(["packages/rialto/src/index.ts"]);
    expect(families).toHaveLength(1);
    expect(families[0].outputs).toEqual([
      "packages/rialto/llms.txt",
      "packages/rialto/llms-full.txt",
    ]);
  });

  it("dedupes multiple staged files in the same package to one family", () => {
    const families = selectLlmsFamilies([
      "packages/rialto/src/index.ts",
      "packages/rialto/src/foo.ts",
    ]);
    expect(families).toHaveLength(1);
  });

  it("returns [] for files with no owning llms-txt package (e.g. docs)", () => {
    expect(selectLlmsFamilies(["docs/foo.md"])).toEqual([]);
  });

  it("returns one family per distinct package across multiple staged files", () => {
    const families = selectLlmsFamilies([
      "packages/rialto/src/index.ts",
      "packages/types/src/index.ts",
    ]);
    expect(families.map((f) => pkgDirFromOutputs(f.outputs)).sort()).toEqual([
      "packages/rialto",
      "packages/types",
    ]);
  });
});

describe("pkgDirFromOutputs", () => {
  it("strips the /llms.txt suffix to recover the package directory", () => {
    expect(pkgDirFromOutputs(["packages/rialto/llms.txt", "packages/rialto/llms-full.txt"])).toBe(
      "packages/rialto"
    );
  });
});

describe("runPrecommitLlmsStage", () => {
  const family = (pkg) => ({
    command: `pnpm --filter @mbe/cli start pack ${pkg}`,
    outputs: [`${pkg}/llms.txt`, `${pkg}/llms-full.txt`],
  });

  it("stages an unchanged-after-regen package without touching root", () => {
    const calls = [];
    const result = runPrecommitLlmsStage({
      families: [family("packages/rialto")],
      regen: (pkgDir) => {
        calls.push(["regen", pkgDir]);
        return true;
      },
      diff: () => [],
      stage: () => {
        calls.push(["stage"]);
      },
    });
    expect(result).toEqual({ ranRoot: false, packagesChanged: [] });
    expect(calls).toEqual([["regen", "packages/rialto"]]);
  });

  it("stages the package output and regenerates root when a package's output actually changed", () => {
    const calls = [];
    const result = runPrecommitLlmsStage({
      families: [family("packages/rialto")],
      regen: (pkgDir) => {
        calls.push(["regen", pkgDir]);
        return true;
      },
      diff: (outputs) => (outputs[0].startsWith("packages/rialto") ? outputs : []),
      stage: (paths) => {
        calls.push(["stage", ...paths]);
      },
    });
    expect(result.ranRoot).toBe(true);
    expect(result.packagesChanged).toEqual(["packages/rialto"]);
    expect(calls).toEqual([
      ["regen", "packages/rialto"],
      ["stage", "packages/rialto/llms.txt", "packages/rialto/llms-full.txt"],
      ["regen", "."],
    ]);
  });

  it("skips a package whose regen command fails, without throwing", () => {
    const calls = [];
    const result = runPrecommitLlmsStage({
      families: [family("packages/rialto")],
      regen: () => false,
      diff: () => {
        calls.push("diff-should-not-run");
        return [];
      },
      stage: () => {
        calls.push("stage-should-not-run");
      },
    });
    expect(result).toEqual({ ranRoot: false, packagesChanged: [] });
    expect(calls).toEqual([]);
  });

  it("does not regenerate root again a second time when the root pack itself produced no diff", () => {
    const rootDiffCalls = [];
    const result = runPrecommitLlmsStage({
      families: [family("packages/rialto")],
      regen: () => true,
      diff: (outputs) => {
        if (outputs[0] === "llms.txt") rootDiffCalls.push(outputs);
        return outputs[0].startsWith("packages/rialto") ? outputs : [];
      },
      stage: () => {},
    });
    expect(result.ranRoot).toBe(true);
    expect(rootDiffCalls).toHaveLength(1);
  });

  it("is a no-op when no families are staged", () => {
    expect(runPrecommitLlmsStage({ families: [] })).toEqual({
      ranRoot: false,
      packagesChanged: [],
    });
  });
});
