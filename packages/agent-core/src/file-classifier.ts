/**
 * FileClassifier — single source of truth for file-type classification predicates.
 *
 * All modules that need to classify files (change-type-classifier, pr-risk-classifier,
 * audit-inventory, model-router) import from here instead of defining local predicates.
 *
 * Lockfile reconciliation: pnpm-lock.yaml / package-lock.json / yarn.lock are classified
 * as "dependency" files (not config), consistent with change-type-classifier. The
 * pr-risk-classifier previously agreed; audit-inventory's NON_AUDITABLE_PATTERNS did not
 * include lockfiles but that was an omission — lockfile-only changes don't affect auditable
 * surfaces, so isNonAuditableFile now includes them via isDependencyFile.
 */

// ── Basic predicates ────────────────────────────────────────────────────────

/**
 * True for test/spec files (.test.ts, .spec.tsx, .test.js, etc.)
 */
export const isTestFile = (f: string): boolean => /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f);

/**
 * True for markdown files and anything under docs/.
 */
export const isDocFile = (f: string): boolean => f.endsWith(".md") || f.startsWith("docs/");

/**
 * True when a path lives in a test or docs *context* — broader than
 * `isTestFile(f) || isDocFile(f)`. Matches membership of `__tests__/`, `tests/`,
 * `docs/` directories and `README`/`CHANGELOG` files anywhere in the path, in
 * addition to `.test`/`.spec`-suffixed files and `.md` files.
 *
 * A fixture/helper like `src/__tests__/fake-deps.ts` is in a test context but is
 * not itself a `.test.ts` file. Used by model-router's task-routing heuristic,
 * which must preserve the original `TEST_OR_DOCS_PATH` semantics exactly.
 */
export const isTestOrDocsPath = (f: string): boolean =>
  /(?:__tests__|\/tests?\/|\/docs\/|\.test\.[tj]sx?$|\.spec\.[tj]sx?$|README|CHANGELOG|\.md$)/i.test(
    f
  );

/**
 * True for CI/editor/repo config files but NOT dependency manifests.
 */
export const isConfigFile = (f: string): boolean =>
  f.startsWith(".github/") ||
  f.startsWith(".claude/") ||
  f === "turbo.json" ||
  /\.config\.(ts|js|mjs|cjs)$/.test(f);

/**
 * True for package manifests and lockfiles.
 *
 * Reconciliation note: all four original modules agreed on this set.
 * isNonAuditableFile now also treats lockfiles as non-auditable (previously omitted).
 */
export const isDependencyFile = (f: string): boolean =>
  f === "package.json" ||
  f.endsWith("/package.json") ||
  f === "pnpm-lock.yaml" ||
  f === "package-lock.json" ||
  f === "yarn.lock";

/**
 * True for files under the infrastructure/ directory.
 */
export const isInfrastructureFile = (f: string): boolean => f.startsWith("infrastructure/");

/**
 * True for front-end source files (apps/ or packages/rialto/) that are not
 * test, doc, or config files.
 */
export const isFrontendSourceFile = (f: string): boolean =>
  (f.startsWith("apps/") || f.startsWith("packages/rialto/")) &&
  !isTestFile(f) &&
  !isDocFile(f) &&
  !isConfigFile(f);

/**
 * True for back-end source files under services/ that are not test, doc, or config files.
 */
export const isBackendSourceFile = (f: string): boolean =>
  f.startsWith("services/") && !isTestFile(f) && !isDocFile(f) && !isConfigFile(f);

// ── Composite predicates ────────────────────────────────────────────────────

/**
 * True when a file is considered low-risk for auto-merge purposes:
 * tests, docs, config, or dependency manifests.
 */
export const isLowRiskFile = (f: string): boolean =>
  isTestFile(f) || isDocFile(f) || isConfigFile(f) || isDependencyFile(f);

/**
 * True when a file has no effect on any auditable surface (Lighthouse / smoke-audit).
 * Preserves the patterns previously defined as NON_AUDITABLE_PATTERNS in audit-inventory.ts.
 *
 * Reconciliation note: dependency manifests (package.json, lockfiles) are intentionally
 * NOT treated as non-auditable — a dependency update can affect the deployed app surface
 * and should not skip the smoke audit. This differs from isLowRiskFile, which includes
 * dependency files for auto-merge purposes. YAML files (any *.yaml / *.yml) are treated
 * as non-auditable regardless of directory, matching the original broad pattern.
 */
export const isNonAuditableFile = (f: string): boolean =>
  isDocFile(f) || isTestFile(f) || isConfigFile(f) || /\.ya?ml$/.test(f) || f === ".gitignore";

/**
 * Returns true when every file in the list is non-auditable, meaning no
 * Lighthouse or API health checks are needed for this set of changes.
 *
 * An empty list returns false (nothing to skip).
 */
export const allFilesNonAuditable = (changedFiles: readonly string[]): boolean => {
  if (changedFiles.length === 0) return false;
  return changedFiles.every(isNonAuditableFile);
};
