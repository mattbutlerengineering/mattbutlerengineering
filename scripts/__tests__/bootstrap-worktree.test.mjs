import { describe, test, expect } from "vitest";
import { decideBootstrapSteps, distConsumedPackages } from "../bootstrap-worktree.mjs";

// ---------------------------------------------------------------------------
// decideBootstrapSteps — pure decision over three inputs (architecture.md
// §1): install when !hasNodeModules || lockNewer; build when missingDists
// is non-empty; install always ordered before build; [] when neither
// applies; invalid input throws (fail closed, never guess).
// ---------------------------------------------------------------------------

describe("decideBootstrapSteps", () => {
  test("missing node_modules → install step", () => {
    expect(
      decideBootstrapSteps({ hasNodeModules: false, lockNewer: false, missingDists: [] })
    ).toEqual([{ step: "install" }]);
  });

  test("stale lockfile with node_modules present → install step", () => {
    expect(
      decideBootstrapSteps({ hasNodeModules: true, lockNewer: true, missingDists: [] })
    ).toEqual([{ step: "install" }]);
  });

  test("missing dists → build step naming exactly those packages", () => {
    expect(
      decideBootstrapSteps({
        hasNodeModules: true,
        lockNewer: false,
        missingDists: ["@mbe/cli", "@mattbutlerengineering/rialto"],
      })
    ).toEqual([{ step: "build", packages: ["@mbe/cli", "@mattbutlerengineering/rialto"] }]);
  });

  test("install ordered before build when both apply", () => {
    expect(
      decideBootstrapSteps({ hasNodeModules: false, lockNewer: false, missingDists: ["@mbe/cli"] })
    ).toEqual([{ step: "install" }, { step: "build", packages: ["@mbe/cli"] }]);
  });

  test("nothing to do → []", () => {
    expect(
      decideBootstrapSteps({ hasNodeModules: true, lockNewer: false, missingDists: [] })
    ).toEqual([]);
  });

  test("throws on non-boolean hasNodeModules", () => {
    expect(() =>
      decideBootstrapSteps({ hasNodeModules: "yes", lockNewer: false, missingDists: [] })
    ).toThrow();
  });

  test("throws on non-boolean lockNewer", () => {
    expect(() =>
      decideBootstrapSteps({ hasNodeModules: true, lockNewer: 1, missingDists: [] })
    ).toThrow();
  });

  test("throws on non-array missingDists", () => {
    expect(() =>
      decideBootstrapSteps({ hasNodeModules: true, lockNewer: false, missingDists: "none" })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// distConsumedPackages — pure filter over parsed package.json descriptors:
// qualifies when any of main/module/types/exports (string leaves,
// recursively) resolves under dist/.
// ---------------------------------------------------------------------------

describe("distConsumedPackages", () => {
  test("a package with main: dist/index.js qualifies", () => {
    const pkgs = [{ name: "@mbe/cli", dir: "tools/cli", json: { main: "dist/index.js" } }];
    expect(distConsumedPackages(pkgs)).toEqual([{ name: "@mbe/cli", dir: "tools/cli" }]);
  });

  test("exports with a nested dist leaf qualifies", () => {
    const pkgs = [
      {
        name: "@mattbutlerengineering/rialto",
        dir: "packages/rialto",
        json: {
          exports: {
            ".": { import: "./dist/index.mjs", require: "./dist/index.cjs" },
            "./styles": "./dist/lib/styles.css",
          },
        },
      },
    ];
    expect(distConsumedPackages(pkgs)).toEqual([
      { name: "@mattbutlerengineering/rialto", dir: "packages/rialto" },
    ]);
  });

  test("a package with only src/ entrypoints does not qualify", () => {
    const pkgs = [
      {
        name: "@mbe/agent-service",
        dir: "services/agent",
        json: { main: "src/index.ts", exports: { ".": "./src/index.ts" } },
      },
    ];
    expect(distConsumedPackages(pkgs)).toEqual([]);
  });

  test("empty workspace → []", () => {
    expect(distConsumedPackages([])).toEqual([]);
  });

  test("a package with no main/module/types/exports does not qualify", () => {
    const pkgs = [{ name: "@mbe/scratch", dir: "tools/scratch", json: {} }];
    expect(distConsumedPackages(pkgs)).toEqual([]);
  });
});
