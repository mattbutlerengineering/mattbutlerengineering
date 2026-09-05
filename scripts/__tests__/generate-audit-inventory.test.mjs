import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SURFACE_REGISTRY as coreRegistry } from "@mbe/agent-core";
import { SURFACE_REGISTRY, regenerateInventory } from "../generate-audit-inventory.mjs";

// #3043: this script used to hand-maintain its own copy of SURFACE_REGISTRY,
// duplicating packages/agent-core/src/audit-surface-registry.ts with no
// compile-time signal on drift. This test guards that the script derives
// its surfaces from the agent-core registry instead of re-declaring them.
describe("generate-audit-inventory surface registry (single source of truth, #3043)", () => {
  it("re-exports the agent-core surface registry", () => {
    expect(Array.isArray(coreRegistry)).toBe(true);
    expect(coreRegistry.length).toBeGreaterThan(0);
    expect(SURFACE_REGISTRY).toBe(coreRegistry);
  });
});

// #4966: this script used to overwrite .audit-state/inventory.json from the
// static registry on every run — writing fresh null/0/[] score fields and
// discarding any real checkHistory/checkCount already recorded by
// scripts/record-audit-check.mjs. regenerateInventory() now merges through
// loadInventory()/saveInventory() (packages/agent-core/src/audit-inventory-store.ts)
// instead of overwriting.
describe("regenerateInventory (merge, #4966)", () => {
  const tmpDirs = [];

  afterEach(async () => {
    await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function makeRepoRoot() {
    const dir = await mkdtemp(join(tmpdir(), "audit-inventory-"));
    tmpDirs.push(dir);
    return dir;
  }

  it("preserves an existing surface's checkHistory/checkCount instead of resetting it", async () => {
    const repoRoot = await makeRepoRoot();
    const surfaceId = coreRegistry[0].id;
    const scores = { performance: 0.9, accessibility: 0.9, bestPractices: 0.9, seo: 0.9 };
    const existing = {
      surfaces: [
        {
          ...coreRegistry[0],
          lastChecked: "2026-01-01T00:00:00.000Z",
          lastScore: scores,
          checkHistory: [{ timestamp: "2026-01-01T00:00:00.000Z", scores }],
          checkCount: 3,
        },
      ],
      lastUpdated: "2026-01-01T00:00:00.000Z",
      version: 1,
    };

    await mkdir(join(repoRoot, ".audit-state"), { recursive: true });
    await writeFile(join(repoRoot, ".audit-state", "inventory.json"), JSON.stringify(existing));

    const result = await regenerateInventory(repoRoot);
    const merged = result.surfaces.find((s) => s.id === surfaceId);
    expect(merged.checkCount).toBe(3);
    expect(merged.checkHistory).toHaveLength(1);

    const onDisk = JSON.parse(
      await readFile(join(repoRoot, ".audit-state", "inventory.json"), "utf-8")
    );
    expect(onDisk.surfaces.find((s) => s.id === surfaceId).checkCount).toBe(3);
  });

  it("seeds a fresh inventory (checkCount 0) when no file exists yet", async () => {
    const repoRoot = await makeRepoRoot();
    const result = await regenerateInventory(repoRoot);
    expect(result.surfaces.length).toBe(coreRegistry.length);
    expect(result.surfaces.every((s) => s.checkCount === 0)).toBe(true);
  });
});

// #4966: the script used to run its rebuild as an unguarded top-level side
// effect (no CLI-entrypoint guard), so merely importing it for its
// SURFACE_REGISTRY re-export — exactly what the describe block above does —
// clobbered the real repo's .audit-state/inventory.json.
describe("import has no top-level write side effect (#4966)", () => {
  it("does not write to the real repo's .audit-state/inventory.json merely by being imported", async () => {
    const repoInventoryPath = new URL("../../.audit-state/inventory.json", import.meta.url)
      .pathname;
    await rm(repoInventoryPath, { force: true });

    const specifier = `../generate-audit-inventory.mjs?side-effect-check=${Date.now()}`;
    await import(/* @vite-ignore */ specifier);

    await expect(access(repoInventoryPath)).rejects.toThrow();
  });
});
