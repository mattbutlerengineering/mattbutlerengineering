/**
 * Regression test for the shipped-but-never-called class: a pure inference or
 * collector module that is fully built and fully unit-tested, yet reachable
 * from nothing that ever runs. Twice now (`domainActivity` per #3493/#3664,
 * the `human_touch_reason` classifier per #3805-#3847) the module looked
 * healthy — green tests, a real importer — while producing zero live output.
 *
 * The discriminating detail is that a direct-importer check would NOT have
 * caught either case: `scripts/classify-human-touch.mjs` always had an
 * importer (`scripts/backfill-human-touch-reasons.mjs`), but that importer was
 * itself a one-time script nothing invoked. Only reachability from a *live*
 * root — a script named by a workflow, a package.json script, or a skill —
 * separates the two states. See scripts/check-orphaned-collectors.mjs.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  parseRelativeImports,
  resolveImport,
  buildImportGraph,
  findLiveRoots,
  findUnreachableCollectors,
  isTestPath,
  formatFinding,
  GUARDED_MODULES,
} from "../check-orphaned-collectors.mjs";

describe("parseRelativeImports", () => {
  it("collects static relative import specifiers", () => {
    const src = [
      `import { a } from "./sibling.mjs";`,
      `import b from '../parent/thing.js';`,
      `export { c } from "./reexported.mjs";`,
    ].join("\n");
    expect(parseRelativeImports(src)).toEqual([
      "./sibling.mjs",
      "../parent/thing.js",
      "./reexported.mjs",
    ]);
  });

  it("collects dynamic relative imports", () => {
    expect(parseRelativeImports(`const m = await import("./lazy.mjs");`)).toEqual(["./lazy.mjs"]);
  });

  it("ignores bare package specifiers — only in-repo edges form the graph", () => {
    const src = [`import { readFileSync } from "node:fs";`, `import x from "@mbe/gh-client";`].join(
      "\n"
    );
    expect(parseRelativeImports(src)).toEqual([]);
  });
});

describe("resolveImport", () => {
  it("resolves a sibling specifier against the importing file", () => {
    expect(
      resolveImport("scripts/backfill-human-touch-reasons.mjs", "./classify-human-touch.mjs")
    ).toBe("scripts/classify-human-touch.mjs");
  });

  it("resolves an upward specifier across directories", () => {
    expect(
      resolveImport("plugins/acmm/scripts/human-touch-reasons.js", "../../../scripts/collect.mjs")
    ).toBe("scripts/collect.mjs");
  });
});

describe("isTestPath", () => {
  it("treats __tests__ members and *.test.* files as tests", () => {
    expect(isTestPath("scripts/__tests__/x.test.mjs")).toBe(true);
    expect(isTestPath("scripts/x.test.mjs")).toBe(true);
  });

  it("treats an ordinary module as non-test", () => {
    expect(isTestPath("scripts/classify-human-touch.mjs")).toBe(false);
  });
});

describe("buildImportGraph", () => {
  it("edges point importer -> imported, and skip test files entirely", () => {
    const files = {
      "scripts/live.mjs": `import { f } from "./mid.mjs";`,
      "scripts/mid.mjs": `import { g } from "./leaf.mjs";`,
      "scripts/leaf.mjs": `export const g = 1;`,
      // A test importing the leaf must not make it reachable.
      "scripts/__tests__/leaf.test.mjs": `import { g } from "../leaf.mjs";`,
    };
    const graph = buildImportGraph(Object.keys(files), (p) => files[p]);

    expect([...(graph.get("scripts/live.mjs") ?? [])]).toEqual(["scripts/mid.mjs"]);
    expect([...(graph.get("scripts/mid.mjs") ?? [])]).toEqual(["scripts/leaf.mjs"]);
    expect(graph.has("scripts/__tests__/leaf.test.mjs")).toBe(false);
  });
});

describe("findLiveRoots", () => {
  it("marks a script named by a workflow, package.json, or skill as live", () => {
    const roots = findLiveRoots({
      scriptPaths: ["scripts/a.mjs", "scripts/b.mjs", "scripts/c.mjs"],
      referenceTexts: ["run: node scripts/a.mjs --check", `"check:b": "node scripts/b.mjs"`],
    });
    expect([...roots].sort()).toEqual(["scripts/a.mjs", "scripts/b.mjs"]);
  });

  it("does not treat a one-time script nothing invokes as live", () => {
    const roots = findLiveRoots({
      scriptPaths: ["scripts/backfill-human-touch-reasons.mjs"],
      referenceTexts: ["run: node scripts/collect-queue-telemetry.mjs"],
    });
    expect(roots.size).toBe(0);
  });
});

describe("findUnreachableCollectors", () => {
  const guarded = [{ module: "scripts/leaf.mjs", reason: "test fixture" }];

  it("reports a guarded module reachable only from a script nothing invokes", () => {
    // The historical shape: leaf <- orphan-importer, orphan-importer <- nothing.
    const graph = new Map([["scripts/orphan.mjs", new Set(["scripts/leaf.mjs"])]]);
    const { findings } = findUnreachableCollectors({
      guarded,
      graph,
      liveRoots: new Set(["scripts/live.mjs"]),
      existingFiles: new Set(["scripts/leaf.mjs", "scripts/orphan.mjs", "scripts/live.mjs"]),
    });
    expect(findings).toEqual([
      { kind: "unreachable", path: "scripts/leaf.mjs", reason: "test fixture" },
    ]);
  });

  it("passes once a live root reaches the module transitively", () => {
    const graph = new Map([
      ["scripts/live.mjs", new Set(["scripts/orphan.mjs"])],
      ["scripts/orphan.mjs", new Set(["scripts/leaf.mjs"])],
    ]);
    const { findings } = findUnreachableCollectors({
      guarded,
      graph,
      liveRoots: new Set(["scripts/live.mjs"]),
      existingFiles: new Set(["scripts/leaf.mjs", "scripts/orphan.mjs", "scripts/live.mjs"]),
    });
    expect(findings).toEqual([]);
  });

  it("passes when the guarded module is itself a live root", () => {
    const { findings } = findUnreachableCollectors({
      guarded,
      graph: new Map(),
      liveRoots: new Set(["scripts/leaf.mjs"]),
      existingFiles: new Set(["scripts/leaf.mjs"]),
    });
    expect(findings).toEqual([]);
  });

  it("reports a guarded entry whose module no longer exists — an exemption must not outlive its subject", () => {
    const { findings } = findUnreachableCollectors({
      guarded,
      graph: new Map(),
      liveRoots: new Set(),
      existingFiles: new Set(),
    });
    expect(findings).toEqual([
      { kind: "missing-module", path: "scripts/leaf.mjs", reason: "test fixture" },
    ]);
  });

  it("does not count a cycle among non-live scripts as reachable", () => {
    const graph = new Map([
      ["scripts/a.mjs", new Set(["scripts/b.mjs"])],
      ["scripts/b.mjs", new Set(["scripts/a.mjs", "scripts/leaf.mjs"])],
    ]);
    const { findings } = findUnreachableCollectors({
      guarded,
      graph,
      liveRoots: new Set(),
      existingFiles: new Set(["scripts/leaf.mjs", "scripts/a.mjs", "scripts/b.mjs"]),
    });
    expect(findings.map((f) => f.kind)).toEqual(["unreachable"]);
  });
});

describe("formatFinding", () => {
  it("names the module and why it is guarded", () => {
    expect(
      formatFinding({ kind: "unreachable", path: "scripts/x.mjs", reason: "because" })
    ).toContain("scripts/x.mjs");
    expect(
      formatFinding({ kind: "missing-module", path: "scripts/x.mjs", reason: "because" })
    ).toContain("no longer exists");
  });
});

describe("GUARDED_MODULES", () => {
  it("every entry carries a reason — an allowlist without one is unmaintainable", () => {
    expect(GUARDED_MODULES.length).toBeGreaterThan(0);
    for (const entry of GUARDED_MODULES) {
      expect(typeof entry.module).toBe("string");
      expect(entry.reason.length).toBeGreaterThan(10);
    }
  });
});

describe("CI wiring", () => {
  // A check nobody runs is the exact defect this check exists to catch, so it
  // has to hold itself to its own rule.
  const pkg = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../package.json"), "utf-8")
  );

  it("repo-audit invokes the check", () => {
    expect(pkg.scripts["repo-audit"]).toContain("scripts/check-orphaned-collectors.mjs");
  });

  it("is exposed as a standalone script for local use", () => {
    expect(pkg.scripts["check:orphaned-collectors"]).toBe(
      "node scripts/check-orphaned-collectors.mjs"
    );
  });
});
