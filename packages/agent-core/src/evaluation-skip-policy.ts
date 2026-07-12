// ── Evaluation skip policy ──────────────────────────────────────────
//
// Pure decision logic for whether the LLM evaluation step can safely be
// skipped. No I/O, no LLM — independently testable. Extracted from
// `success-evaluator.ts` so the gate decision and the LLM call live in
// separate seams.

import { parseDiff } from "./diff-parser.js";

export interface SkipPolicyInput {
  readonly diff: string;
  /** Whether tests passed during the agent run */
  readonly testsPassed?: boolean;
  /** Commit title, used for dependency-bump detection */
  readonly commitTitle?: string;
}

export type SkipReason =
  "empty_diff" | "trivial_commit" | "test_only_changes" | "small_diff_tests_passed";

export interface SkipDecision {
  readonly skip: boolean;
  readonly reason?: SkipReason;
}

const TRIVIAL_TITLE_PATTERNS = [/^fix\(security\):/i, /^chore\(deps\):/i];
const TEST_FILE_RE = /\.(test|spec)\.[jt]sx?$/;
const SMALL_DIFF_LINE_LIMIT = 50;

/**
 * Returns the skip decision for the LLM evaluation step.
 *
 * Conditions that skip evaluation (first match wins):
 * 1. `empty_diff` — diff is empty/whitespace-only.
 * 2. `trivial_commit` — commit title matches a dependency-bump pattern.
 * 3. `test_only_changes` — every changed file is a test file.
 * 4. `small_diff_tests_passed` — diff < 50 lines AND tests passed.
 *
 * Pure function — no I/O, no LLM.
 */
export function evaluationSkipDecision(input: SkipPolicyInput): SkipDecision {
  const { diff, commitTitle, testsPassed } = input;

  if (!diff.trim()) {
    return { skip: true, reason: "empty_diff" };
  }

  if (commitTitle && TRIVIAL_TITLE_PATTERNS.some((re) => re.test(commitTitle))) {
    return { skip: true, reason: "trivial_commit" };
  }

  const { files, totalAddedLines, totalRemovedLines } = parseDiff(diff);
  if (files.length > 0 && files.every((f) => TEST_FILE_RE.test(f.path))) {
    return { skip: true, reason: "test_only_changes" };
  }

  if (testsPassed === true && totalAddedLines + totalRemovedLines < SMALL_DIFF_LINE_LIMIT) {
    return { skip: true, reason: "small_diff_tests_passed" };
  }

  return { skip: false };
}
