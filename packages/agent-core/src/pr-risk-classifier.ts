/**
 * PR risk classifier — identifies PRs that are safe to auto-merge as soon as
 * CI passes, without waiting for the next ship-loop iteration.
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
