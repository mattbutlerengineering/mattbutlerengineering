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

/** Matches the `gitdir: <path>/.git/worktrees/<name>` contents of a worktree's `.git` file. */
const WORKTREE_GITDIR_RE = /^gitdir:.*[/\\]worktrees[/\\]/;

/**
 * True when `dirPath` is the root of a nested git worktree checkout — i.e. its
 * `.git` entry is a FILE (not a directory) whose contents point into
 * `worktrees/`. A primary checkout's own `.git` is always a directory, so
 * this never matches it.
 *
 * @param {string} dirPath - absolute path to the candidate directory
 * @returns {boolean}
 */
export function isNestedGitWorktree(dirPath) {
  const gitPath = path.join(dirPath, ".git");
  let stat;
  try {
    stat = fs.lstatSync(gitPath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;

  let content;
  try {
    content = fs.readFileSync(gitPath, "utf-8");
  } catch {
    return false;
  }
  return WORKTREE_GITDIR_RE.test(content.trim());
}

/**
 * Recursively walk a directory tree, returning absolute file paths.
 *
 * Nested git worktrees (a subdirectory whose `.git` is a file pointing into
 * `worktrees/`, e.g. one registered via `git worktree add <path>` inside the
 * tree being walked) are skipped with a warning rather than double-counted —
 * see #3884.
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
        if (isNestedGitWorktree(fullPath)) {
          console.warn(
            `warning: skipping nested git worktree at ${path.relative(root, fullPath)}/`
          );
          continue;
        }
        walk(fullPath);
      } else if (entry.isFile() && (!match || match(entry.name, fullPath))) {
        results.push(fullPath);
      }
    }
  }

  walk(root);
  return results;
}
