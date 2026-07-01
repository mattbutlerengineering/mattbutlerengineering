import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Guards the feature-flags package seam: FeatureFlagMap and the deprecated
// parseFeatureFlags/isEnabled pair must stay internal to feature-flags.ts.
// Consumers must go through createFeatureContext() instead. See #2836.

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const CANONICAL_FILE = join(__dirname, "feature-flags.ts");
const THIS_FILE = join(__dirname, "feature-flags-boundary.test.ts");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".turbo",
  "coverage",
  "graphify-out",
  "generated",
]);

const FORBIDDEN_NAMES = ["FeatureFlagMap", "parseFeatureFlags", "isEnabled"];
const IMPORT_PATTERN = /import\s+(?:type\s+)?\{([\s\S]*?)\}\s*from\s*["']([^"']+)["']/g;
const FEATURE_FLAGS_MODULE_PATTERN = /feature-flags|service-bootstrap/;

function collectSourceFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(fullPath, files);
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function findLeakingImports(filePath: string): string[] {
  const content = readFileSync(filePath, "utf8");
  const leaks: string[] = [];
  for (const match of content.matchAll(IMPORT_PATTERN)) {
    const [, importedNames, moduleSpecifier] = match;
    if (!FEATURE_FLAGS_MODULE_PATTERN.test(moduleSpecifier)) continue;
    for (const name of FORBIDDEN_NAMES) {
      if (new RegExp(`\\b${name}\\b`).test(importedNames)) {
        leaks.push(`${relative(REPO_ROOT, filePath)}: imports "${name}" from "${moduleSpecifier}"`);
      }
    }
  }
  return leaks;
}

describe("feature-flags package boundary", () => {
  it("does not export FeatureFlagMap, parseFeatureFlags, or isEnabled from the package's public surface", () => {
    const indexSource = readFileSync(join(__dirname, "index.ts"), "utf8");
    for (const name of FORBIDDEN_NAMES) {
      expect(indexSource).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
  });

  it("has no consumer importing FeatureFlagMap, parseFeatureFlags, or isEnabled from the feature-flags module", () => {
    const sourceFiles = collectSourceFiles(REPO_ROOT).filter(
      (filePath) => filePath !== CANONICAL_FILE && filePath !== THIS_FILE
    );
    const leaks = sourceFiles.flatMap(findLeakingImports);
    expect(leaks).toEqual([]);
  });
});
