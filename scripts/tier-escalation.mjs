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

/**
 * Same keyword set and #5956 guards as tier-classifier.yml's inline rule:
 * masks code spans before matching, and excludes a keyword flanked by a
 * hyphen + word char on either side (a longer hyphenated identifier like
 * `check-deploy-secret-provisioning`) via the lookaround pair below.
 */
const KEYWORD_RE =
  /(?<!\w-)\b(?:secrets?|credentials?|rotate|leak(?:s|ed|ing)?|incidents?)\b(?!-\w)/i;

/**
 * Same-sentence incident cue: distinguishes a real incident report ("we
 * leaked the Stripe key") from a bare descriptive mention ("…credentials or
 * CI/artifact access…", #6541).
 */
const INCIDENT_CUE_RE =
  /leaked|exposed|compromised|breached|revoked|rotat(?:e|ed|ing)\s+(?:the|our|this|all|its)\b|incident\s+(?:report|response|review)|security incident/i;

/**
 * @param {string} [text]
 * @returns {string} `text` with fenced and inline code spans masked out, so a
 *   keyword written inside backticks can't escalate (#5956).
 */
function maskCodeSpans(text) {
  return (text ?? "").replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");
}

/**
 * Pure decision: does a secrets/incident keyword mention escalate this PR?
 * Mirrors tier-classifier.yml's inline rule, split into three outcomes
 * instead of mutating `highest` directly — the workflow adapter applies
 * `hardset-T4` as `highest = T4` and `bump` as `highest = min(T4, highest+1)`,
 * matching the existing gate verbatim.
 *
 * @param {{ title?: string, bodyProse?: string, pathTier?: number }} [input]
 * @returns {{ action: 'none'|'bump'|'hardset-T4', reason: string }}
 */
export function decideKeywordEscalation({ title = "", bodyProse = "", pathTier = T1 } = {}) {
  const maskedTitle = maskCodeSpans(title);
  const maskedBody = maskCodeSpans(bodyProse);

  if (!KEYWORD_RE.test(`${maskedTitle} ${maskedBody}`)) {
    return { action: "none", reason: "no secrets/incident keyword found" };
  }

  // Existing gate, kept verbatim: a keyword mention plus a changed file that
  // already matched a T3/T4 sensitive-path rule hard-sets T4 regardless of
  // an incident cue — a keyword on a sensitive path is the signal this rule
  // exists to catch.
  if (pathTier >= T3) {
    return {
      action: "hardset-T4",
      reason:
        "escalate to T4: title/body mentions secrets or incident (sensitive path already matched)",
    };
  }

  if (KEYWORD_RE.test(maskedTitle)) {
    return { action: "bump", reason: "escalate one tier: title mentions secrets or incident" };
  }

  const sentences = maskedBody.split(/(?<=[.!?])\s+|\n/);
  const hasIncidentSentence = sentences.some(
    (sentence) => KEYWORD_RE.test(sentence) && INCIDENT_CUE_RE.test(sentence)
  );
  if (hasIncidentSentence) {
    return {
      action: "bump",
      reason: "escalate one tier: title/body mentions secrets or incident with an incident cue",
    };
  }

  return { action: "none", reason: "keyword mentioned without an incident cue or sensitive path" };
}
