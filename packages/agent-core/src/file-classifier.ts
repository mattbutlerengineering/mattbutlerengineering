/**
 * FileClassifier — single source of truth for file-type predicates.
 *
 * Four modules previously defined the same classification concepts independently:
 * change-type-classifier, pr-risk-classifier, audit-inventory, and model-router.
 * All callers now import from here, so any extension (e.g. adding .mts) requires
 * a single edit.
 */

// ── Primitive predicates ────────────────────────────────────────────

/** Returns true when the file is a test or spec file. */
export function isTestFile(path: string): boolean {
  return /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(path);
}

/** Returns true when the file is a documentation file. */
export function isDocFile(path: string): boolean {
  return path.endsWith(".md") || path.startsWith("docs/");
}

/** Returns true when the file is a project config file. */
export function isConfigFile(path: string): boolean {
  return (
    path.startsWith(".github/") ||
    path.startsWith(".claude/") ||
    path === "turbo.json" ||
    /\.config\.(ts|js|mjs|cjs)$/.test(path)
  );
}

/** Returns true when the file is a dependency manifest or lockfile. */
export function isDependencyFile(path: string): boolean {
  return (
    path === "package.json" ||
    path.endsWith("/package.json") ||
    path === "pnpm-lock.yaml" ||
    path === "package-lock.json" ||
    path === "yarn.lock"
  );
}

/** Returns true when the file is under the infrastructure/ directory. */
export function isInfrastructureFile(path: string): boolean {
  return path.startsWith("infrastructure/");
}

/**
 * Returns true when the file is a frontend source file (apps/ or packages/rialto/),
 * excluding test, doc, and config files.
 */
export function isFrontendSourceFile(path: string): boolean {
  return (
    (path.startsWith("apps/") || path.startsWith("packages/rialto/")) &&
    !isTestFile(path) &&
    !isDocFile(path) &&
    !isConfigFile(path)
  );
}

/**
 * Returns true when the file is a backend source file (services/),
 * excluding test, doc, and config files.
 */
export function isBackendSourceFile(path: string): boolean {
  return (
    path.startsWith("services/") && !isTestFile(path) && !isDocFile(path) && !isConfigFile(path)
  );
}

// ── Composite predicates ────────────────────────────────────────────

/**
 * Returns true when the file is low-risk — i.e. safe to auto-merge without
 * waiting for broader QA (tests, docs, dependency manifests, config).
 */
export function isLowRiskFile(path: string): boolean {
  return isTestFile(path) || isDocFile(path) || isDependencyFile(path) || isConfigFile(path);
}

/**
 * Non-auditable file patterns — files known to have no effect on any auditable
 * surface (Lighthouse scores, API health, smoke tests).
 *
 * Includes all patterns from the former NON_AUDITABLE_PATTERNS regex array in
 * audit-inventory.ts, plus .claude/ and turbo.json from isConfigFile.
 */
const NON_AUDITABLE_PATTERNS: readonly RegExp[] = [
  /^docs\//,
  /\.md$/,
  /^\.github\//,
  /\.ya?ml$/,
  /\.(test|spec)\.(ts|tsx|js|jsx)$/,
  /^\.claude\//,
  /^\.gitignore$/,
  /^turbo\.json$/,
];

/**
 * Returns true when the file is known to have no effect on any auditable surface.
 * The smoke audit can be skipped when every changed file satisfies this check.
 */
export function isNonAuditableFile(path: string): boolean {
  return NON_AUDITABLE_PATTERNS.some((pattern) => pattern.test(path));
}
