/**
 * Regression test: dependency-cruiser's `no-orphans` rule (.dependency-cruiser.cjs)
 * flags a module no one imports. A vitest `setupFiles` entry is never imported
 * directly — vitest loads it by config, not by an `import` statement — so every
 * such file must match one of the rule's `pathNot` exclusion patterns or it
 * reads as dead code. The exclusion list is hand-maintained regexes keyed to
 * specific naming conventions (`setupTests.ts`, a `test/` directory, a
 * `vitest.*` prefix); a setup file using a convention none of them match
 * (`src/test-setup.ts` in packages/hospitality-sidenav) slips through as a
 * false-positive orphan warning. This test scans every `vitest.config.*` in
 * the repo for its `setupFiles` entries and asserts each one is excluded, so
 * the next new naming convention is caught here instead of as warning noise.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  ".turbo",
  "dist",
  "build",
  "coverage",
  "storybook-static",
  "playwright-report",
  "test-results",
]);

function findVitestConfigs(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findVitestConfigs(entryPath));
    } else if (/^vitest\.config\.[cm]?[jt]s$/.test(entry.name)) {
      results.push(entryPath);
    }
  }
  return results;
}

/** Extracts relative setupFiles string literals from a vitest config's source text. */
function extractSetupFilePaths(configPath) {
  const content = readFileSync(configPath, "utf-8");
  const match = content.match(/setupFiles:\s*\[([^\]]*)\]/);
  if (!match) return [];
  return [...match[1].matchAll(/["']([^"']+)["']/g)]
    .map((m) => m[1])
    .filter((s) => s.startsWith("./") || s.startsWith("../"));
}

describe("dependency-cruiser no-orphans exclusions", () => {
  it("excludes every vitest setupFiles entry in the repo", async () => {
    const config = (await import("../../.dependency-cruiser.cjs")).default;
    const noOrphans = config.forbidden.find((rule) => rule.name === "no-orphans");
    const patterns = noOrphans.from.pathNot.map((p) => new RegExp(p));

    const configs = findVitestConfigs(root);
    expect(configs.length).toBeGreaterThan(0);

    const uncovered = [];
    for (const configPath of configs) {
      for (const entry of extractSetupFilePaths(configPath)) {
        const repoRelative = relative(root, join(dirname(configPath), entry)).replace(/\\/g, "/");
        if (!patterns.some((re) => re.test(repoRelative))) {
          uncovered.push(repoRelative);
        }
      }
    }

    expect(uncovered).toEqual([]);
  });
});
