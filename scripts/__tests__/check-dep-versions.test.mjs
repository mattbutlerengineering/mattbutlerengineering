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

describe("check-dep-versions", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dep-versions-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("discoverPackageJsons", () => {
    test("collects package name, path, and merged deps for each workspace package", async () => {
      writePackage(tmpDir, "packages/a", "@mbe/a", { vitest: "^4.0.0" });

      const { discoverPackageJsons } = await import("../check-dep-versions.js");
      const results = discoverPackageJsons(tmpDir);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        name: "@mbe/a",
        path: "packages/a/package.json",
        deps: { vitest: "^4.0.0" },
      });
    });
  });

  describe("findVersionMismatches", () => {
    test("returns no mismatches when a synced dep is on the same version everywhere", async () => {
      const { findVersionMismatches } = await import("../check-dep-versions.js");
      const packages = [
        { name: "@mbe/a", path: "packages/a/package.json", deps: { vitest: "^4.0.0" } },
        { name: "@mbe/b", path: "packages/b/package.json", deps: { vitest: "^4.0.0" } },
      ];

      expect(findVersionMismatches(packages, ["vitest"])).toHaveLength(0);
    });

    test("reports a mismatch when a synced dep resolves to two versions", async () => {
      const { findVersionMismatches } = await import("../check-dep-versions.js");
      const packages = [
        { name: "@mbe/a", path: "packages/a/package.json", deps: { vitest: "^4.0.0" } },
        { name: "@mbe/b", path: "packages/b/package.json", deps: { vitest: "^3.0.0" } },
      ];

      const mismatches = findVersionMismatches(packages, ["vitest"]);
      expect(mismatches).toHaveLength(1);
      expect(mismatches[0].dep).toBe("vitest");
      expect([...mismatches[0].versions.keys()].sort()).toEqual(["^3.0.0", "^4.0.0"]);
    });

    test("ignores workspace: and catalog: protocol references", async () => {
      const { findVersionMismatches } = await import("../check-dep-versions.js");
      const packages = [
        { name: "@mbe/a", path: "packages/a/package.json", deps: { vitest: "workspace:*" } },
        { name: "@mbe/b", path: "packages/b/package.json", deps: { vitest: "catalog:" } },
      ];

      expect(findVersionMismatches(packages, ["vitest"])).toHaveLength(0);
    });
  });

  describe("findDepVersionFindings", () => {
    test("aggregates a real fixture end-to-end into no mismatches when consistent", async () => {
      writePackage(tmpDir, "packages/a", "@mbe/a", { vitest: "^4.0.0" });
      writePackage(tmpDir, "packages/b", "@mbe/b", { vitest: "^4.0.0" });

      const { findDepVersionFindings } = await import("../check-dep-versions.js");
      const { mismatches } = findDepVersionFindings(tmpDir, ["vitest"]);

      expect(mismatches).toHaveLength(0);
    });

    test("aggregates a real fixture end-to-end into a mismatch when inconsistent", async () => {
      writePackage(tmpDir, "packages/a", "@mbe/a", { vitest: "^4.0.0" });
      writePackage(tmpDir, "packages/b", "@mbe/b", { vitest: "^3.0.0" });

      const { findDepVersionFindings } = await import("../check-dep-versions.js");
      const { mismatches } = findDepVersionFindings(tmpDir, ["vitest"]);

      expect(mismatches.length).toBeGreaterThan(0);
    });
  });
});
