/**
 * PR risk classifier — identifies PRs that are safe to auto-merge as soon as
 * CI passes, without waiting for the next implement-queue iteration.
 *
 * A PR is "low-risk" when every changed file matches `isLowRiskFile` in
 * `./file-classifier.ts` — that predicate is the single source of truth for
 * the allowlisted categories (tests, docs, config, dependency manifests,
 * metrics telemetry). Consult it directly rather than duplicating its globs
 * here or elsewhere; that duplication is what let `metrics/**` silently fall
 * outside the fast path (see #3887).
 */

import { isLowRiskFile } from "./file-classifier.js";

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

  return files.every((file) => isLowRiskFile(file));
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
    // Playwright E2E specs and their support modules — strict-mode selector
    // collisions, volatile-text locators, stateful-mock gaps. Not just
    // *.spec.ts: a support module like api-mocks.ts or fixtures.ts can carry
    // the same class of bug (see #3896's blocking finding on api-mocks.ts).
    name: "e2e-selector-drift-reviewer",
    matches: (f) => /^apps\/[^/]+\/e2e\//.test(f),
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

/**
 * Every reviewer name registered in `DIFF_REVIEWERS`, as a runtime source of
 * truth. Exported for the `.claude/agents/*.md` coverage test — every
 * reviewer-type agent file must either appear here or be on that test's
 * explicit allowlist (see #3916).
 */
export const DIFF_REVIEWER_NAMES: readonly string[] = DIFF_REVIEWERS.map((r) => r.name);
