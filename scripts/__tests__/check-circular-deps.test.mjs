import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function writePackage(root, dir, name, deps) {
  const fullDir = path.join(root, dir);
  fs.mkdirSync(fullDir, { recursive: true });
  fs.writeFileSync(
    path.join(fullDir, "package.json"),
    JSON.stringify({ name, dependencies: deps })
  );
}

describe("check-circular-deps", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "circular-deps-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("discoverPackages", () => {
    test("collects @mbe/* deps for each workspace package", async () => {
      writePackage(tmpDir, "packages/a", "@mbe/a", { "@mbe/b": "workspace:*" });
      writePackage(tmpDir, "packages/b", "@mbe/b", {});

      const { discoverPackages } = await import("../check-circular-deps.js");
      const packages = discoverPackages(tmpDir);

      expect(packages.get("@mbe/a")).toEqual({ deps: ["@mbe/b"], dir: "packages/a" });
      expect(packages.get("@mbe/b")).toEqual({ deps: [], dir: "packages/b" });
    });

    test("ignores non-@mbe/* dependencies", async () => {
      writePackage(tmpDir, "packages/a", "@mbe/a", { react: "^18.0.0" });

      const { discoverPackages } = await import("../check-circular-deps.js");
      const packages = discoverPackages(tmpDir);

      expect(packages.get("@mbe/a").deps).toEqual([]);
    });
  });

  describe("findCycles", () => {
    test("returns no cycles for a simple acyclic graph", async () => {
      const { findCycles } = await import("../check-circular-deps.js");
      const packages = new Map([
        ["@mbe/a", { deps: ["@mbe/b"], dir: "packages/a" }],
        ["@mbe/b", { deps: [], dir: "packages/b" }],
      ]);

      expect(findCycles(packages)).toHaveLength(0);
    });

    test("detects a direct A → B → A cycle", async () => {
      const { findCycles } = await import("../check-circular-deps.js");
      const packages = new Map([
        ["@mbe/a", { deps: ["@mbe/b"], dir: "packages/a" }],
        ["@mbe/b", { deps: ["@mbe/a"], dir: "packages/b" }],
      ]);

      const cycles = findCycles(packages);
      expect(cycles).toHaveLength(1);
      expect(cycles[0]).toContain("@mbe/a");
      expect(cycles[0]).toContain("@mbe/b");
    });
  });

  describe("findCircularDepFindings", () => {
    test("aggregates a real fixture end-to-end into no cycles when acyclic", async () => {
      writePackage(tmpDir, "packages/a", "@mbe/a", { "@mbe/b": "workspace:*" });
      writePackage(tmpDir, "packages/b", "@mbe/b", {});

      const { findCircularDepFindings } = await import("../check-circular-deps.js");
      const { cycles } = findCircularDepFindings(tmpDir);

      expect(cycles).toHaveLength(0);
    });

    test("aggregates a real fixture end-to-end into a cycle when circular", async () => {
      writePackage(tmpDir, "packages/a", "@mbe/a", { "@mbe/b": "workspace:*" });
      writePackage(tmpDir, "packages/b", "@mbe/b", { "@mbe/a": "workspace:*" });

      const { findCircularDepFindings } = await import("../check-circular-deps.js");
      const { cycles } = findCircularDepFindings(tmpDir);

      expect(cycles.length).toBeGreaterThan(0);
    });
  });
});
