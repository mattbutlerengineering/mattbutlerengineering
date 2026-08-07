/**
 * Regression test for the silent-gap class: a directory of green tests that
 * is not a pnpm workspace package never runs under `turbo test`, so CI reports
 * success while the tests never execute. `infrastructure/worker` sat that way
 * with 245 passing edge-router tests. See scripts/check-orphaned-tests.mjs.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  collectTestFiles,
  findOrphanedTests,
  findRunnableWorkspaceDirs,
  toFindings,
  formatFinding,
  ALLOWLIST,
} from "../check-orphaned-tests.mjs";

/** Builds a throwaway repo root, returns its path. */
function makeFixture({ workspaceYaml, packages = {}, files = [] }) {
  const root = mkdtempSync(join(tmpdir(), "orphaned-tests-"));
  writeFileSync(join(root, "pnpm-workspace.yaml"), workspaceYaml);

  for (const [dir, pkg] of Object.entries(packages)) {
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, "package.json"), JSON.stringify(pkg));
  }

  for (const file of files) {
    const full = join(root, file);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, "// test\n");
  }

  return root;
}

describe("collectTestFiles", () => {
  let root;
  afterEach(() => root && rmSync(root, { recursive: true, force: true }));

  it("finds test and spec files across extensions", () => {
    root = makeFixture({
      workspaceYaml: "packages:\n",
      files: ["a/x.test.js", "a/y.spec.ts", "a/z.test.mjs", "a/w.test.tsx"],
    });

    expect(collectTestFiles(root, root)).toEqual([
      "a/w.test.tsx",
      "a/x.test.js",
      "a/y.spec.ts",
      "a/z.test.mjs",
    ]);
  });

  it("ignores non-test sources and skipped directories", () => {
    root = makeFixture({
      workspaceYaml: "packages:\n",
      files: ["a/impl.js", "a/node_modules/dep/d.test.js", "a/dist/b.test.js", "a/real.test.js"],
    });

    expect(collectTestFiles(root, root)).toEqual(["a/real.test.js"]);
  });
});

describe("findRunnableWorkspaceDirs", () => {
  let root;
  afterEach(() => root && rmSync(root, { recursive: true, force: true }));

  it("returns only workspace packages declaring a test script", () => {
    root = makeFixture({
      workspaceYaml: 'packages:\n  - "packages/*"\n  - "infrastructure/pulumi"\n',
      packages: {
        "packages/runs": { name: "runs", scripts: { test: "vitest run" } },
        "packages/silent": { name: "silent", scripts: { build: "tsc" } },
        "infrastructure/pulumi": { name: "infra", scripts: { test: "vitest run" } },
      },
    });

    expect(findRunnableWorkspaceDirs(root).sort()).toEqual([
      "infrastructure/pulumi",
      "packages/runs",
    ]);
  });

  it("skips directories matched by a glob but lacking a package.json", () => {
    root = makeFixture({
      workspaceYaml: 'packages:\n  - "packages/*"\n',
      packages: { "packages/real": { name: "real", scripts: { test: "vitest run" } } },
      files: ["packages/bare/thing.test.js"],
    });

    expect(findRunnableWorkspaceDirs(root)).toEqual(["packages/real"]);
  });
});

describe("findOrphanedTests", () => {
  it("flags a test file outside every runnable workspace package", () => {
    const { orphans } = findOrphanedTests({
      testFiles: ["packages/a/x.test.ts", "infrastructure/worker/edge-router.test.js"],
      runnableDirs: ["packages/a"],
      allowlist: [],
    });

    expect(orphans).toEqual(["infrastructure/worker/edge-router.test.js"]);
  });

  it("flags tests in a workspace package that has no test script", () => {
    // The package exists but never appears in runnableDirs — turbo skips it.
    const { orphans } = findOrphanedTests({
      testFiles: ["packages/silent/x.test.ts"],
      runnableDirs: [],
      allowlist: [],
    });

    expect(orphans).toEqual(["packages/silent/x.test.ts"]);
  });

  it("does not treat a prefix-sharing sibling directory as covered", () => {
    // "packages/a-extra" must not be considered inside "packages/a".
    const { orphans } = findOrphanedTests({
      testFiles: ["packages/a-extra/x.test.ts"],
      runnableDirs: ["packages/a"],
      allowlist: [],
    });

    expect(orphans).toEqual(["packages/a-extra/x.test.ts"]);
  });

  it("exempts allowlisted prefixes", () => {
    const { orphans } = findOrphanedTests({
      testFiles: ["tests/smoke/smoke.spec.ts"],
      runnableDirs: [],
      allowlist: [{ prefix: "tests/smoke/", reason: "playwright" }],
    });

    expect(orphans).toEqual([]);
  });

  it("reports allowlist entries that match nothing", () => {
    const { staleAllowlist } = findOrphanedTests({
      testFiles: ["packages/a/x.test.ts"],
      runnableDirs: ["packages/a"],
      allowlist: [{ prefix: "gone/", reason: "deleted long ago" }],
    });

    expect(staleAllowlist).toEqual(["gone/"]);
  });

  it("passes cleanly when every test file is covered", () => {
    expect(
      findOrphanedTests({
        testFiles: ["packages/a/x.test.ts", "services/b/y.test.ts"],
        runnableDirs: ["packages/a", "services/b"],
        allowlist: [],
      })
    ).toEqual({ orphans: [], staleAllowlist: [] });
  });
});

describe("toFindings", () => {
  it("collapses orphan files to one finding per directory, with a count", () => {
    expect(
      toFindings({
        orphans: [
          "infrastructure/worker/csp.test.js",
          "infrastructure/worker/origins.test.js",
          "infrastructure/worker/health/uptime.test.js",
        ],
        staleAllowlist: [],
      })
    ).toEqual([
      { kind: "orphan", path: "infrastructure/worker", count: 2 },
      { kind: "orphan", path: "infrastructure/worker/health", count: 1 },
    ]);
  });

  it("includes stale allowlist entries", () => {
    expect(toFindings({ orphans: [], staleAllowlist: ["gone/"] })).toEqual([
      { kind: "stale-allowlist", path: "gone/" },
    ]);
  });

  it("yields no findings when there is nothing to report", () => {
    expect(toFindings({ orphans: [], staleAllowlist: [] })).toEqual([]);
  });
});

describe("formatFinding", () => {
  it("names the offending directory and how many tests it hides", () => {
    expect(formatFinding({ kind: "orphan", path: "infrastructure/worker", count: 15 })).toBe(
      "infrastructure/worker/ — 15 test file(s) never run by CI"
    );
  });

  it("tells the reader to remove a stale allowlist entry", () => {
    expect(formatFinding({ kind: "stale-allowlist", path: "gone/" })).toContain("remove it");
  });
});

describe("ALLOWLIST", () => {
  it("gives every exemption a reason naming its actual runner", () => {
    for (const entry of ALLOWLIST) {
      expect(entry.reason.length).toBeGreaterThan(20);
    }
  });
});

describe("this repository", () => {
  it("has no test file that CI never runs", () => {
    const findings = toFindings(
      findOrphanedTests({
        testFiles: collectTestFiles(process.cwd(), process.cwd()),
        runnableDirs: findRunnableWorkspaceDirs(),
      })
    );

    expect(findings.map(formatFinding)).toEqual([]);
  });
});
