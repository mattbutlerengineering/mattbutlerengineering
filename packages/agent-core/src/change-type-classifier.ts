/**
 * Change-type classifier — determines which ship-loop phases can be skipped
 * based on the types of files changed in a PR or commit.
 *
 * Classification rules are defined as data (array of rule objects) and matched
 * in priority order. If all files match a single type, that type's skip phases
 * apply. If files span multiple types, the result is "mixed" with no skips.
 */

// ── Types ───────────────────────────────────────────────────────────

export type ChangeType =
  | "dependency"
  | "docs"
  | "config"
  | "test"
  | "infrastructure"
  | "frontend"
  | "backend"
  | "mixed";

export type SkippablePhase = "smoke-audit" | "deploy-verify" | "lighthouse" | "e2e";

export interface ChangeClassification {
  readonly type: ChangeType;
  readonly files: readonly string[];
  readonly skipPhases: readonly SkippablePhase[];
  readonly reason: string;
}

interface ClassificationRule {
  readonly type: ChangeType;
  readonly matches: (file: string) => boolean;
  readonly skipPhases: readonly SkippablePhase[];
}

// ── Helpers ─────────────────────────────────────────────────────────

const isTestFile = (f: string): boolean => /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f);

const isDocFile = (f: string): boolean => f.endsWith(".md") || f.startsWith("docs/");

const isConfigFile = (f: string): boolean =>
  f.startsWith(".github/") ||
  f.startsWith(".claude/") ||
  f === "turbo.json" ||
  /\.config\.(ts|js|mjs|cjs)$/.test(f);

const isDependencyFile = (f: string): boolean =>
  f === "package.json" ||
  f.endsWith("/package.json") ||
  f === "pnpm-lock.yaml" ||
  f === "package-lock.json" ||
  f === "yarn.lock";

const isInfrastructureFile = (f: string): boolean => f.startsWith("infrastructure/");

const isFrontendFile = (f: string): boolean =>
  (f.startsWith("apps/") || f.startsWith("packages/rialto/")) &&
  !isTestFile(f) &&
  !isDocFile(f) &&
  !isConfigFile(f);

const isBackendFile = (f: string): boolean =>
  f.startsWith("services/") && !isTestFile(f) && !isDocFile(f) && !isConfigFile(f);

// ── Rules (priority order) ──────────────────────────────────────────

const CLASSIFICATION_RULES: readonly ClassificationRule[] = [
  {
    type: "dependency",
    matches: isDependencyFile,
    skipPhases: ["smoke-audit", "lighthouse", "e2e"],
  },
  {
    type: "docs",
    matches: isDocFile,
    skipPhases: ["deploy-verify", "smoke-audit", "lighthouse", "e2e"],
  },
  {
    type: "config",
    matches: isConfigFile,
    skipPhases: ["smoke-audit", "lighthouse", "e2e"],
  },
  {
    type: "test",
    matches: isTestFile,
    skipPhases: ["deploy-verify", "lighthouse", "e2e"],
  },
  {
    type: "infrastructure",
    matches: isInfrastructureFile,
    skipPhases: ["smoke-audit", "lighthouse", "e2e"],
  },
  {
    type: "frontend",
    matches: isFrontendFile,
    skipPhases: [],
  },
  {
    type: "backend",
    matches: isBackendFile,
    skipPhases: ["lighthouse"],
  },
] as const;

// ── Constants ───────────────────────────────────────────────────────

/** Change types that are safe to auto-merge once CI passes. */
const LOW_RISK_TYPES: ReadonlySet<ChangeType> = new Set([
  "dependency",
  "docs",
  "config",
  "test",
  "infrastructure",
]);

// ── Core functions ──────────────────────────────────────────────────

/**
 * Returns `true` when every file in `files` classifies as a low-risk change
 * type (dependency, docs, config, test, or infrastructure) and the PR can be
 * auto-merged immediately once CI passes.
 *
 * Returns `false` for an empty file list, mixed-type changes, or any list
 * containing frontend or backend source files.
 */
export function isLowRiskPR(files: readonly string[]): boolean {
  if (files.length === 0) {
    return false;
  }
  return LOW_RISK_TYPES.has(classifyChanges(files).type);
}

/**
 * Classifies a list of changed files into a single change type and determines
 * which ship-loop phases can be safely skipped.
 *
 * If all files match a single type, that type is returned with its skip phases.
 * If files span multiple types (or the list is empty), returns "mixed" with no skips.
 */
export function classifyChanges(files: readonly string[]): ChangeClassification {
  if (files.length === 0) {
    return {
      type: "mixed",
      files: [],
      skipPhases: [],
      reason: "mixed change (0 files)",
    };
  }

  // Find the matching rule for each file
  const matchedTypes = new Set<ChangeType>();

  for (const file of files) {
    const rule = CLASSIFICATION_RULES.find((r) => r.matches(file));
    if (rule) {
      matchedTypes.add(rule.type);
    } else {
      // Unrecognized file → treat as mixed
      matchedTypes.add("mixed");
    }
  }

  // If all files match a single type, use that type's skip phases
  if (matchedTypes.size === 1) {
    const type = [...matchedTypes][0];
    const rule = CLASSIFICATION_RULES.find((r) => r.type === type);
    const skipPhases = rule?.skipPhases ?? [];

    return {
      type,
      files,
      skipPhases,
      reason: buildReason(type, files.length, skipPhases),
    };
  }

  // Multiple types → mixed, no skips
  return {
    type: "mixed",
    files,
    skipPhases: [],
    reason: buildReason("mixed", files.length, []),
  };
}

/**
 * Returns `true` if the given phase should be skipped for this classification.
 */
export function shouldSkipPhase(
  classification: ChangeClassification,
  phase: SkippablePhase
): boolean {
  return classification.skipPhases.includes(phase);
}

/**
 * Formats a classification as a human-readable one-liner.
 *
 * Examples:
 * - "dependency change (3 files) — skipping: smoke-audit, lighthouse, e2e"
 * - "frontend change (1 file)"
 */
export function formatClassification(classification: ChangeClassification): string {
  return classification.reason;
}

// ── Internal helpers ────────────────────────────────────────────────

function buildReason(
  type: ChangeType,
  fileCount: number,
  skipPhases: readonly SkippablePhase[]
): string {
  const fileLabel = fileCount === 1 ? "1 file" : `${fileCount} files`;
  const base = `${type} change (${fileLabel})`;

  if (skipPhases.length === 0) {
    return base;
  }

  return `${base} — skipping: ${skipPhases.join(", ")}`;
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
  {
    // Payment, webhook, deposit, and Stripe-touching files — catches missing
    // webhook signature verification, dropped idempotency keys, float/integer
    // money handling, and broken refund/deposit/charge state transitions that
    // CI regex and schema checks cannot surface.
    name: "stripe-flow-reviewer",
    matches: (f) =>
      /(?:^|\/)(?:payment|payments|webhook|webhooks|deposit|deposits|stripe|charge|charges|refund|refunds)[^/]*\.[tj]sx?$/.test(
        f
      ),
  },
  {
    // Generated artifacts (llms.txt context bundles, generated zod schemas,
    // dependency graph) and the pack generator that emits them. These drift
    // non-deterministically across platforms (locale-sensitive sorts) or go
    // stale relative to their source — a class of Integrity failure CI only
    // catches after push. See the byte-order-comparator fix for the root cause.
    name: "generated-artifact-determinism-reviewer",
    matches: (f) =>
      f === "tools/cli/src/commands/pack.ts" ||
      f === "llms.txt" ||
      f === "llms-full.txt" ||
      f.endsWith("/llms.txt") ||
      f.endsWith("/llms-full.txt") ||
      f.endsWith("/generated-schemas.ts") ||
      f === "infrastructure/worker/dep-graph.json" ||
      f === "docs/architecture/dependency-graph.md",
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
