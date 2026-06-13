/**
 * PR risk classifier — identifies PRs that are safe to auto-merge as soon as
 * CI passes, without waiting for the next implement-queue iteration.
 *
 * A PR is "low-risk" when every changed file falls into one of these categories:
 *   - Test files  (*.test.ts, *.test.tsx, *.spec.ts, *.spec.tsx, *.test.js, *.spec.js, *.test.jsx, *.spec.jsx)
 *   - Documentation  (*.md, docs/**)
 *   - Dependency manifests  (package.json, pnpm-lock.yaml, package-lock.json, yarn.lock)
 *   - Config files  (.github/**, .claude/**, turbo.json, *.config.ts, *.config.js, *.config.mjs)
 */

/** Pattern groups that are considered low-risk. */
const LOW_RISK_PATTERNS: ReadonlyArray<(file: string) => boolean> = [
  // Test files
  (f) => /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f),

  // Documentation
  (f) => f.endsWith(".md") || f.startsWith("docs/"),

  // Dependency manifests
  (f) =>
    f === "package.json" ||
    f.endsWith("/package.json") ||
    f === "pnpm-lock.yaml" ||
    f === "package-lock.json" ||
    f === "yarn.lock",

  // Config files
  (f) =>
    f.startsWith(".github/") ||
    f.startsWith(".claude/") ||
    f === "turbo.json" ||
    /\.(config)\.(ts|js|mjs|cjs)$/.test(f) ||
    /\.(config)\.(ts|js|mjs|cjs)$/.test(f.split("/").pop() ?? ""),
];

/**
 * Returns `true` when every file in `files` is considered low-risk and the PR
 * can be auto-merged immediately once CI passes.
 *
 * Returns `false` for an empty file list — a PR with no changed files is
 * unusual and should not be auto-merged without human review.
 */
export function isLowRiskPR(files: readonly string[]): boolean {
  if (files.length === 0) {
    return false;
  }

  return files.every((file) => LOW_RISK_PATTERNS.some((matches) => matches(file)));
}

// ── Diff-matched specialized reviewers ───────────────────────────────────────

/**
 * Maps a changed-file predicate to the specialized review agent that should
 * inspect a PR touching those files. Each reviewer catches a class of semantic
 * regression that CI (lint/typecheck/test) cannot. Order here is the order
 * `reviewersForDiff` returns them in — keep it intentional.
 */
const DIFF_REVIEWERS: ReadonlyArray<{ name: string; matches: (file: string) => boolean }> = [
  {
    // Prisma schema or migration SQL — destructive/semantic migration review.
    name: "migration-reviewer",
    matches: (f) => /\.prisma$/.test(f) || /(?:^|\/)migrations?\/.*\.sql$/i.test(f),
  },
  {
    // Server code and the edge router — most governed by active ADRs
    // (RFC-7807 errors, api-versioning, auth). Excludes tests.
    name: "adr-compliance-reviewer",
    matches: (f) =>
      (/^services\/[^/]+\/src\//.test(f) || /^infrastructure\/worker\/src\//.test(f)) &&
      !/\.(test|spec)\.[tj]sx?$/.test(f),
  },
  {
    // Rialto component or component-test changes — prop-drift between a
    // component's *Props interface and its tests.
    name: "rialto-prop-drift-detector",
    matches: (f) =>
      f.startsWith("packages/rialto/src/components/") ||
      f.startsWith("packages/rialto/src/test/") ||
      /^packages\/rialto\/src\/.*\.(test|spec)\.tsx$/.test(f),
  },
  {
    // Dependency manifests — version-bump safety across the monorepo.
    name: "dependency-update-reviewer",
    matches: (f) =>
      f === "package.json" ||
      f.endsWith("/package.json") ||
      f === "pnpm-lock.yaml" ||
      f === "pnpm-workspace.yaml",
  },
];

/**
 * Returns the specialized review agents whose trigger matches at least one
 * changed file, de-duplicated and in a stable order. Most PRs match zero or
 * one reviewer. Used by implement-queue to gate a PR before the merge train.
 */
export function reviewersForDiff(files: readonly string[]): string[] {
  return DIFF_REVIEWERS.filter((r) => files.some((f) => r.matches(f))).map((r) => r.name);
}
