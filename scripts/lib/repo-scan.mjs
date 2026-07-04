import fs from "node:fs";
import path from "node:path";

/**
 * Shared repo-walk helper for fitness-check scripts.
 *
 * Consolidates three previously-separate directory-walking implementations
 * (each with its own exclusion list) that lived in check-ai-antipatterns.mjs,
 * check-doc-freshness.mjs, and check-env-sync.js.
 */

/** Directories that are never useful to scan for source/docs fitness checks. */
export const DEFAULT_IGNORE_DIRS = new Set([
  "node_modules",
  "dist",
  "generated",
  "storybook-static",
  ".git",
  ".claude",
  ".agent-worktrees",
  "coverage",
  ".turbo",
  ".stryker-tmp",
]);

/**
 * Recursively walk a directory tree, returning absolute file paths.
 *
 * @param {string} root - absolute directory path to walk
 * @param {object} [opts]
 * @param {Set<string>} [opts.ignoreDirs] - directory basenames to skip (default: DEFAULT_IGNORE_DIRS)
 * @param {(name: string, fullPath: string) => boolean} [opts.match] - only include files
 *   for which this returns true; omit to include every file
 * @returns {string[]}
 */
export function walkFiles(root, { ignoreDirs = DEFAULT_IGNORE_DIRS, match } = {}) {
  const results = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile() && (!match || match(entry.name, fullPath))) {
        results.push(fullPath);
      }
    }
  }

  walk(root);
  return results;
}
