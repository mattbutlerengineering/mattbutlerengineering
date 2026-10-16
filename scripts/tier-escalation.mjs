#!/usr/bin/env node

/**
 * tier-escalation.mjs — pure escalation policy for
 * `.github/workflows/tier-classifier.yml` (#6655).
 *
 * Mirrors scripts/merge-queue-eligibility.mjs: the policy a workflow
 * enforces moves into a dependency-free ES module so it is unit-testable
 * and replayable offline, and the workflow keeps only transport. This file
 * currently exports the size-escalation half of that policy
 * (countReviewSurfaceAdditions, decideSizeEscalation) — see
 * docs/features/tier-escalation-false-positives/architecture.md for the
 * full module shape (keyword escalation and the replay CLI land in later
 * breakdown items).
 *
 * The motivating bug: tier-classifier.yml's inline `added` count sums every
 * line in the diff, including generated artifacts the diff carries but
 * nobody reviews (llms.txt regen, lockfile churn, generated schemas). A PR
 * that is mostly generated output but under the human-reviewed-line
 * threshold was escalating to tier:critical anyway (#6610: 1194 generated +
 * 16 docs + 988 code = 2198 raw lines, escalated despite only 1004 review
 * surface lines — itself still under 1000 once generated is excluded).
 * #6591 (1387 code + 943 docs = 2330 lines, all of it real review surface)
 * correctly stays escalated.
 */

/**
 * Path segments/exact paths excluded from review-surface counting — the
 * classifier's own generated-T1 class (see the T1 rules in
 * tier-classifier.yml) plus run-artifact markdown under docs/features/** and
 * docs/fixes/**. Kept here as the single source of truth;
 * docs/change-tiers.md must restate this list verbatim (drift test in
 * scripts/__tests__/tier-escalation.test.mjs once that doc lands).
 */
export const EXCLUDED_REVIEW_SURFACE_PATTERNS = [
  "**/llms.txt",
  "**/llms-full.txt",
  "pnpm-lock.yaml",
  "**/registry.json",
  "infrastructure/worker/dep-graph.json",
  "docs/architecture/dependency-graph.md",
  "**/generated*",
  "docs/features/**/*.md",
  "docs/fixes/**/*.md",
];

const EXACT_EXCLUDED_PATHS = new Set([
  "pnpm-lock.yaml",
  "infrastructure/worker/dep-graph.json",
  "docs/architecture/dependency-graph.md",
]);

/**
 * @param {string} path
 * @returns {boolean} true iff `path` is excluded from review-surface
 *   counting — i.e. it does NOT count toward size escalation.
 */
export function isExcludedFromReviewSurface(path) {
  if (EXACT_EXCLUDED_PATHS.has(path)) return true;
  if (/(^|\/)(llms|llms-full)\.txt$/.test(path)) return true;
  if (/(^|\/)registry\.json$/.test(path)) return true;
  // "**/generated*" — any path segment that itself starts with "generated"
  // (a `generated/` directory, or a filename like generated-schemas.ts).
  if (path.split("/").some((segment) => /^generated/i.test(segment))) return true;
  if (/^docs\/(features|fixes)\/.*\.md$/.test(path)) return true;
  return false;
}

/**
 * @typedef {{ path: string, additions?: number }} FileAddition
 */

/**
 * Sums `additions` over files that count as review surface, excluding the
 * generated/run-artifact classes above. Every other file — including every
 * other `*.md` — counts.
 *
 * @param {FileAddition[]} [files]
 * @returns {number} total counted additions, never NaN.
 */
export function countReviewSurfaceAdditions(files = []) {
  let total = 0;
  for (const file of files ?? []) {
    if (!file || typeof file.path !== "string") continue;
    if (isExcludedFromReviewSurface(file.path)) continue;
    const additions = Number(file.additions);
    total += Number.isFinite(additions) ? additions : 0;
  }
  return total;
}

/** Tier numbers, matching tier-classifier.yml's own T1..T4 constants. */
export const T1 = 1;
export const T2 = 2;
export const T3 = 3;
export const T4 = 4;

const REVIEW_SURFACE_ESCALATION_THRESHOLD = 1000;

/**
 * Pure decision: does the counted review-surface line total bump this PR
 * one tier? Mirrors tier-classifier.yml's existing `added > 1000` rule, but
 * reads the generated-excluded count instead of the raw diff total.
 *
 * @param {{ files?: FileAddition[], highestTier?: number }} [input]
 * @returns {{ escalate: boolean, counted: number, reason: string }}
 */
export function decideSizeEscalation({ files = [], highestTier = T1 } = {}) {
  const counted = countReviewSurfaceAdditions(files);
  const escalate = counted > REVIEW_SURFACE_ESCALATION_THRESHOLD && highestTier < T4;
  const reason = escalate
    ? `escalate one tier: ${counted} review-surface lines added`
    : `no size escalation: ${counted} review-surface lines added`;
  return { escalate, counted, reason };
}
