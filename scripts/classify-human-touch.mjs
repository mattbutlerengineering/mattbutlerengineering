/**
 * classify-human-touch.mjs — infer why a merged agent PR needed a human
 * (non-author) commit, from commit metadata alone.
 *
 * DIRECTIONAL SIGNAL, NOT GROUND TRUTH: this is a best-effort heuristic over
 * commit message text, CI status, and review-comment counts. It is meant to
 * turn one opaque "human touched this PR" percentage into a rough
 * reason-breakdown so the next optimization pass has a real target — not to
 * assert with confidence why any single commit happened. Treat the output
 * as a starting point for triage, not an audit trail.
 *
 * Taxonomy (`HUMAN_TOUCH_REASONS`, single source of truth) lives in
 * `collect-queue-telemetry.mjs` (#3843) — this module infers into it, it
 * does not redefine it.
 *
 * Agent-PR detection reuses `isAgentPr()` from
 * `plugins/acmm/scripts/pr-outcomes.js` — there is deliberately no second
 * definition of "agent PR" here.
 *
 * Pure inference only: this module takes already-fetched `pr`/`commit`
 * objects and never shells out to `gh` or touches the network, so it can be
 * unit-tested without mocking I/O. Fetching those objects is the caller's
 * job (see `reconcile-queue-telemetry.mjs` for the sibling read/write
 * pattern this follows).
 *
 * Guardrail: `classifyHumanTouch` never throws. Any input that doesn't look
 * like a real PR/commit — missing fields, wrong types, null, non-agent PR —
 * falls back to `"other"` rather than propagating an error.
 */

import { isAgentPr } from "../plugins/acmm/scripts/pr-outcomes.js";

const MERGE_CONFLICT_MARKER_RE = /<<<<<<<|>>>>>>>/;
const MERGE_CONFLICT_MENTION_RE =
  /\b(merge conflicts?|resolve[ds]? conflicts?|conflict resolution|fix(?:ed|ing)? conflicts?)\b/i;
const SCOPE_CHANGE_RE =
  /\b(de-?scope|scope change|out[- ]of[- ]scope|reduce[ds]? scope|expand(?:ed)? scope|narrow(?:ed)? scope)\b/i;

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate that `pr` has a shape `isAgentPr()` can safely read without
 * throwing (it does `pr.labels?.includes(...)` and `!pr.headRefName`, which
 * throw on a non-object `pr` or blow up on a non-array `labels`).
 *
 * @param {unknown} pr
 */
function isValidPrShape(pr) {
  if (!isPlainObject(pr)) return false;
  if (pr.labels !== undefined && !Array.isArray(pr.labels)) return false;
  if (pr.headRefName !== undefined && typeof pr.headRefName !== "string") return false;
  return true;
}

/**
 * @param {string} message
 */
function hasMergeConflictSignal(message) {
  return MERGE_CONFLICT_MARKER_RE.test(message) || MERGE_CONFLICT_MENTION_RE.test(message);
}

/**
 * @param {string} message
 */
function hasScopeChangeSignal(message) {
  return SCOPE_CHANGE_RE.test(message);
}

/**
 * Infer the human-touch reason for one non-author commit on a merged agent
 * PR. Checked in order of signal specificity: explicit conflict markers/
 * mentions, then CI failure at commit time, then prior review comments,
 * then scope-change language, else `"other"`.
 *
 * @param {unknown} pr - PR shape `isAgentPr()` expects (`headRefName`, `labels`).
 * @param {unknown} commit - Commit metadata.
 * @param {string} [commit.message] - Commit message.
 * @param {string|null} [commit.ciConclusion] - CI conclusion at commit time
 *   (e.g. "failure" | "success" | "neutral" | "cancelled").
 * @param {number} [commit.reviewCommentsBefore] - Count of PR review
 *   comments posted before this commit's timestamp.
 * @returns {"review-fix"|"ci-failure"|"merge-conflict"|"scope-change"|"other"}
 */
export function classifyHumanTouch(pr, commit) {
  if (!isValidPrShape(pr) || !isAgentPr(pr)) return "other";

  const message = isPlainObject(commit) && typeof commit.message === "string" ? commit.message : "";
  const ciConclusion = isPlainObject(commit) ? commit.ciConclusion : undefined;
  const reviewCommentsBefore = isPlainObject(commit) ? commit.reviewCommentsBefore : undefined;

  if (hasMergeConflictSignal(message)) return "merge-conflict";
  if (ciConclusion === "failure") return "ci-failure";
  if (typeof reviewCommentsBefore === "number" && reviewCommentsBefore > 0) return "review-fix";
  if (hasScopeChangeSignal(message)) return "scope-change";
  return "other";
}
