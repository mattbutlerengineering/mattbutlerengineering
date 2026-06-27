/**
 * prune-worktrees.mjs — Worktree-prune hygiene for .claude/worktrees/
 *
 * Pure selector:
 *   selectStaleWorktrees(worktrees, maxAgeMs, worktreeRoot) → string[]
 *
 * IO layer (runs git worktree prune + fs.rm):
 *   pruneWorktrees({ repoRoot, maxAgeMs, dryRun })
 *
 * Safety: only targets .claude/worktrees/*; rejects paths outside that root.
 *
 * Usage:
 *   node scripts/prune-worktrees.mjs            # dry-run
 *   node scripts/prune-worktrees.mjs --force    # actually remove
 *
 * Env overrides:
 *   MAX_AGE_MS=<ms>   Age threshold (default: 7 days)
 */

import { execFileSync } from "node:child_process";
import { rmSync, readdirSync, statSync } from "node:fs";
import { join, resolve, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_AGE_MS = 7 * DAY_MS;

/**
 * @typedef {{ path: string; mtimeMs: number }} WorktreeEntry
 */

/**
 * Pure selector: returns paths from `worktrees` that are older than `maxAgeMs`.
 *
 * Stale = age strictly greater than maxAgeMs (boundary is kept as fresh).
 * Throws if any path is outside `worktreeRoot` (path-traversal guard).
 *
 * @param {WorktreeEntry[]} worktrees
 * @param {number} maxAgeMs
 * @param {string} worktreeRoot - Absolute, normalized root (e.g. /repo/.claude/worktrees)
 * @param {number} [nowMs] - Reference timestamp in ms (default: Date.now(); injectable for tests)
 * @returns {string[]}
 */
export function selectStaleWorktrees(worktrees, maxAgeMs, worktreeRoot, nowMs = Date.now()) {
  const normalizedRoot = normalize(worktreeRoot);
  const now = nowMs;

  return worktrees
    .map(({ path, mtimeMs }) => {
      const normalizedPath = normalize(resolve(path));
      if (!normalizedPath.startsWith(normalizedRoot + "/") && normalizedPath !== normalizedRoot) {
        throw new Error(`Path "${normalizedPath}" is outside worktree root "${normalizedRoot}"`);
      }
      return { path: normalizedPath, mtimeMs };
    })
    .filter(({ mtimeMs }) => now - mtimeMs > maxAgeMs)
    .map(({ path }) => path);
}

/**
 * List worktrees under `worktreeRoot` with their mtime.
 *
 * @param {string} worktreeRoot
 * @returns {WorktreeEntry[]}
 */
function listWorktrees(worktreeRoot) {
  let entries;
  try {
    entries = readdirSync(worktreeRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((e) => e.isDirectory())
    .map((e) => {
      const fullPath = join(worktreeRoot, e.name);
      const { mtimeMs } = statSync(fullPath);
      return { path: fullPath, mtimeMs };
    });
}

/**
 * IO layer: prune git worktree metadata then remove stale directories.
 *
 * @param {{ repoRoot: string; maxAgeMs: number; dryRun: boolean }} opts
 */
export async function pruneWorktrees({ repoRoot, maxAgeMs, dryRun }) {
  const worktreeRoot = join(repoRoot, ".claude", "worktrees");

  // Step 1: prune dangling git worktree metadata
  if (dryRun) {
    console.log("[DRY RUN] git worktree prune --dry-run");
    execFileSync("git", ["worktree", "prune", "--dry-run"], {
      cwd: repoRoot,
      stdio: "inherit",
    });
  } else {
    console.log("Running: git worktree prune --verbose");
    execFileSync("git", ["worktree", "prune", "--verbose"], {
      cwd: repoRoot,
      stdio: "inherit",
    });
  }

  // Step 2: select and remove stale worktree directories
  const worktrees = listWorktrees(worktreeRoot);
  const stalePaths = selectStaleWorktrees(worktrees, maxAgeMs, worktreeRoot);

  console.log(`\nFound ${stalePaths.length} stale worktree(s) (threshold: ${maxAgeMs / DAY_MS}d):`);

  if (stalePaths.length === 0) {
    console.log("  Nothing to remove.");
    return;
  }

  for (const p of stalePaths) {
    if (dryRun) {
      console.log(`  [DRY RUN] Would remove: ${p}`);
    } else {
      console.log(`  Removing: ${p}`);
      rmSync(p, { recursive: true, force: true });
    }
  }

  if (!dryRun) {
    console.log(`\nRemoved ${stalePaths.length} stale worktree(s).`);
  }
}

// CLI entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dryRun = !process.argv.includes("--force");
  const maxAgeMs = process.env.MAX_AGE_MS ? Number(process.env.MAX_AGE_MS) : DEFAULT_MAX_AGE_MS;

  if (Number.isNaN(maxAgeMs) || maxAgeMs <= 0) {
    console.error("Invalid MAX_AGE_MS — must be a positive number of milliseconds.");
    process.exit(1);
  }

  const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf-8",
  }).trim();

  console.log(`=== Worktree prune hygiene ===`);
  console.log(`Mode: ${dryRun ? "DRY RUN (pass --force to delete)" : "LIVE"}`);
  console.log(`Root: ${repoRoot}/.claude/worktrees`);
  console.log(`Max age: ${maxAgeMs / DAY_MS} day(s)\n`);

  pruneWorktrees({ repoRoot, maxAgeMs, dryRun }).catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
