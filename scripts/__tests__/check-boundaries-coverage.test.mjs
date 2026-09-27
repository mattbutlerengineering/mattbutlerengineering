/**
 * Regression test for the silent-gap class fixed in #5491 for
 * `infrastructure/worker` and left open for `plugins/`, `scripts/` and
 * `infrastructure/pulumi` (#5790): `check:boundaries`'s depcruise scan args
 * are a hand-maintained list that can silently drift from the real set of
 * pnpm workspace packages declared in pnpm-workspace.yaml. A workspace
 * package outside that list passes CI's Architecture Audit job with zero
 * boundary enforcement and looks identical to a covered one. See
 * scripts/check-boundaries-coverage.mjs.
 */

import { describe, it, expect } from "vitest";

import {
  parseBoundariesScanArgs,
  findUncoveredWorkspaceDirs,
  formatFinding,
} from "../check-boundaries-coverage.mjs";

describe("parseBoundariesScanArgs", () => {
  it("extracts the positional depcruise path args, stopping at the first flag", () => {
    const pkg = {
      scripts: {
        "check:boundaries":
          "depcruise apps services packages tools infrastructure/worker --config .dependency-cruiser.cjs",
      },
    };

    expect(parseBoundariesScanArgs(pkg)).toEqual([
      "apps",
      "services",
      "packages",
      "tools",
      "infrastructure/worker",
    ]);
  });

  it("throws when the script is missing", () => {
    expect(() => parseBoundariesScanArgs({ scripts: {} })).toThrow(/check:boundaries/);
  });

  it("throws when the script doesn't invoke depcruise", () => {
    expect(() => parseBoundariesScanArgs({ scripts: { "check:boundaries": "echo nope" } })).toThrow(
      /depcruise/
    );
  });
});

describe("findUncoveredWorkspaceDirs", () => {
  it("flags a workspace dir not covered by any scan arg", () => {
    expect(
      findUncoveredWorkspaceDirs({
        workspaceDirs: ["apps/hospitality", "plugins/acmm", "scripts", "infrastructure/pulumi"],
        scanArgs: ["apps", "services", "packages", "tools", "infrastructure/worker"],
      })
    ).toEqual(["infrastructure/pulumi", "plugins/acmm", "scripts"]);
  });

  it("treats an exact-path scan arg as covering only itself and its children", () => {
    expect(
      findUncoveredWorkspaceDirs({
        workspaceDirs: ["infrastructure/worker", "infrastructure/pulumi"],
        scanArgs: ["infrastructure/worker"],
      })
    ).toEqual(["infrastructure/pulumi"]);
  });

  it("does not treat a prefix-sharing sibling directory as covered", () => {
    // "infrastructure/worker-extra" must not be considered inside "infrastructure/worker".
    expect(
      findUncoveredWorkspaceDirs({
        workspaceDirs: ["infrastructure/worker-extra"],
        scanArgs: ["infrastructure/worker"],
      })
    ).toEqual(["infrastructure/worker-extra"]);
  });

  it("treats a bare top-level scan arg as covering every nested workspace dir", () => {
    expect(
      findUncoveredWorkspaceDirs({
        workspaceDirs: ["apps/hospitality", "apps/marketing"],
        scanArgs: ["apps"],
      })
    ).toEqual([]);
  });

  it("passes cleanly when every workspace dir is covered", () => {
    expect(
      findUncoveredWorkspaceDirs({
        workspaceDirs: ["apps/hospitality", "plugins/acmm", "scripts"],
        scanArgs: ["apps", "plugins", "scripts"],
      })
    ).toEqual([]);
  });
});

describe("formatFinding", () => {
  it("names the uncovered directory", () => {
    expect(formatFinding("plugins/acmm")).toContain("plugins/acmm");
  });
});

describe("this repository", () => {
  it("covers every workspace package with check:boundaries' depcruise scan args", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { discoverWorkspaceGlobs, resolveGlob, root } =
      await import("../dep-graph-discovery.mjs");

    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
    const scanArgs = parseBoundariesScanArgs(pkg);
    const workspaceDirs = discoverWorkspaceGlobs(root).flatMap((glob) =>
      resolveGlob(glob, root).map(({ wsDir }) => wsDir)
    );

    expect(findUncoveredWorkspaceDirs({ workspaceDirs, scanArgs })).toEqual([]);
  });
});
