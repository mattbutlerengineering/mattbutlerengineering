import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ── Constants ────────────────────────────────────────────────────────

/** Files that are allowed to change in a trivial dependency bump. */
const ALLOWED_DEP_FILES = new Set(["package.json", "pnpm-lock.yaml"]);

/**
 * Maximum number of changed lines (additions + deletions) in the non-lockfile
 * portion of the diff before we consider the bump non-trivial.
 */
const MAX_NON_LOCK_DIFF_LINES = 20;

// ── Types ────────────────────────────────────────────────────────────

export interface TrivialDepBumpResult {
  readonly isTrivial: boolean;
  /** Reason the bump was deemed non-trivial (undefined when isTrivial=true). */
  readonly reason?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Extract the set of file paths changed in a unified diff.
 *
 * Handles both top-level and workspace paths, e.g.:
 *   "diff --git a/package.json b/package.json"
 *   "diff --git a/apps/foo/package.json b/apps/foo/package.json"
 */
function extractChangedFiles(diff: string): readonly string[] {
  const files: string[] = [];
  for (const line of diff.split("\n")) {
    if (!line.startsWith("diff --git ")) continue;
    // e.g. "diff --git a/some/path/package.json b/some/path/package.json"
    const match = line.match(/diff --git a\/\S+ b\/(.+)$/);
    if (match) {
      files.push(match[1]);
    }
  }
  return files;
}

/**
 * Count added + removed lines in a diff.
 * Excludes unified-diff file headers (lines starting with `---` or `+++`).
 */
function countDiffLines(diff: string): number {
  return diff
    .split("\n")
    .filter(
      (line) =>
        (line.startsWith("+") || line.startsWith("-")) &&
        !line.startsWith("---") &&
        !line.startsWith("+++")
    ).length;
}

/**
 * Extract only the hunks that belong to non-lockfile files from the diff.
 * We strip pnpm-lock.yaml sections to apply the line-count guard only to
 * the meaningful version bump lines in package.json.
 */
function extractNonLockfileDiff(diff: string): string {
  const sections = diff.split(/(?=^diff --git )/m);
  return sections
    .filter((section) => !section.includes("pnpm-lock.yaml"))
    .join("");
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Determines whether a git diff represents a trivial dependency bump that can
 * be merged directly without a PR review cycle.
 *
 * A diff is considered trivial when ALL of the following are true:
 * 1. Every changed file is either `package.json` or `pnpm-lock.yaml`
 *    (matched by basename — workspace nesting is allowed).
 * 2. The non-lockfile diff is less than MAX_NON_LOCK_DIFF_LINES lines.
 */
export function isTrivialDepBump(diff: string): TrivialDepBumpResult {
  if (!diff.trim()) {
    return { isTrivial: false, reason: "Empty diff — nothing to evaluate" };
  }

  const changedFiles = extractChangedFiles(diff);

  if (changedFiles.length === 0) {
    return { isTrivial: false, reason: "Could not detect changed files in diff" };
  }

  // Check 1: every changed file must be an allowed dependency file (by basename)
  const disallowedFiles = changedFiles.filter(
    (filePath) => !ALLOWED_DEP_FILES.has(filePath.split("/").at(-1) ?? "")
  );

  if (disallowedFiles.length > 0) {
    return {
      isTrivial: false,
      reason: `Non-dependency files changed: ${disallowedFiles.join(", ")}`,
    };
  }

  // Check 2: non-lockfile diff must be small
  const nonLockDiff = extractNonLockfileDiff(diff);
  const nonLockLines = countDiffLines(nonLockDiff);

  if (nonLockLines >= MAX_NON_LOCK_DIFF_LINES) {
    return {
      isTrivial: false,
      reason: `Non-lockfile diff has ${nonLockLines} changed lines (limit: ${MAX_NON_LOCK_DIFF_LINES})`,
    };
  }

  return { isTrivial: true };
}

// ── Direct merge ─────────────────────────────────────────────────────

/**
 * Merges a branch directly into the base branch without creating a PR for
 * human review. This is only safe for trivial dependency bumps that have
 * already been guarded by `isTrivialDepBump` and confirmed passing tests.
 *
 * Strategy:
 *   1. Create the PR (needed for the merge audit trail on GitHub).
 *   2. Immediately squash-merge and delete the branch.
 *
 * Returns the PR URL that was created and merged.
 */
export async function mergeDirectly(options: {
  readonly branchName: string;
  readonly baseBranch: string;
  readonly repoPath: string;
  readonly commitTitle: string;
}): Promise<string> {
  const { branchName, baseBranch, repoPath, commitTitle } = options;

  // Step 1: Create the PR (gets us a URL / audit trail)
  const createArgs = [
    "pr",
    "create",
    "--title",
    commitTitle,
    "--body",
    "Trivial dependency bump — auto-merged by agent-core (no PR review required).",
    "--base",
    baseBranch,
    "--head",
    branchName,
    "--json",
    "url",
  ];

  const { stdout: createOut } = await execFileAsync("gh", createArgs, { cwd: repoPath });
  const { url } = JSON.parse(createOut.trim()) as { url: string };

  // Step 2: Squash-merge and delete the branch immediately
  const mergeArgs = [
    "pr",
    "merge",
    "--squash",
    "--delete-branch",
    "--auto",
    url,
  ];

  await execFileAsync("gh", mergeArgs, { cwd: repoPath });

  return url;
}
