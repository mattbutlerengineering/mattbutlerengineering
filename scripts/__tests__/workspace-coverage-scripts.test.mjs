import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Guards against the exact regression in #3568: a workspace package that
 * defines `test` but not `test:coverage` never contributes to
 * `pnpm turbo test:coverage`, so its tests silently never run in CI even
 * though `pnpm turbo test` (and a green tick) suggests they do.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const WORKSPACE_GLOB_DIRS = ["apps", "services", "packages", "tools"];
const WORKSPACE_LITERAL_DIRS = ["infrastructure/pulumi", "scripts"];

/**
 * Pre-existing gaps discovered while fixing #3568, not sanctioned exceptions.
 * Each entry means that package's test suite still never runs under
 * `test:coverage`. Remove an entry once the package gains the script —
 * the assertion below will fail loudly if it's left stale.
 */
const KNOWN_MISSING_COVERAGE_SCRIPT = new Set(["packages/config", "packages/rialto"]);

function workspacePackageDirs() {
  const dirs = new Set(WORKSPACE_LITERAL_DIRS);
  for (const parent of WORKSPACE_GLOB_DIRS) {
    const parentPath = path.join(REPO_ROOT, parent);
    for (const entry of fs.readdirSync(parentPath, { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.add(path.join(parent, entry.name));
    }
  }
  return [...dirs].filter((dir) => fs.existsSync(path.join(REPO_ROOT, dir, "package.json"))).sort();
}

describe("every workspace package with a test script also exposes test:coverage", () => {
  for (const dir of workspacePackageDirs()) {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, dir, "package.json"), "utf8"));
    if (!pkg.scripts?.test) continue;

    test(`${dir} exposes test:coverage`, () => {
      if (KNOWN_MISSING_COVERAGE_SCRIPT.has(dir)) {
        expect(pkg.scripts["test:coverage"]).toBeUndefined();
        return;
      }
      expect(pkg.scripts["test:coverage"]).toBeTruthy();
    });
  }
});
