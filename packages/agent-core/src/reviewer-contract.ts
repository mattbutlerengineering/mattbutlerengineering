/**
 * Input passed to a Reviewer sub-agent by implement-queue.
 *
 * Contains everything the Reviewer needs to evaluate worker output before
 * a PR is created: the full diff, verification results, the task spec,
 * and the acceptance criteria that define "done".
 */
export interface ReviewInput {
  /** The git diff produced by the implement-queue worker's commit(s). */
  readonly diff: string;

  /** Trimmed stdout+stderr from the verification run (lint / typecheck / test). */
  readonly verificationOutput: string;

  /** The original task description that drove the worker session. */
  readonly taskDescription: string;

  /** Structured acceptance criteria extracted from the issue body or PRD. */
  readonly acceptanceCriteria: readonly string[];

  /** Files touched by the diff (output of `gh pr diff --name-only`). */
  readonly changedFiles: readonly string[];

  /** The commit message written by the worker after completing its changes. */
  readonly commitMessage: string;
}

/**
 * A single issue found by the Reviewer during evaluation.
 */
export interface ReviewIssue {
  /** Short human-readable label (e.g. "hallucination", "regression", "test_failure"). */
  readonly category: ReviewIssueCategory;

  /** Concise description of the problem. */
  readonly description: string;

  /** File path where the issue manifests, if applicable. */
  readonly filePath?: string;

  /** Line number where the issue manifests, if applicable. */
  readonly lineNumber?: number;

  /** Optional suggested fix (could be a code snippet or natural-language guidance). */
  readonly suggestion?: string;
}

/**
 * Categorisation of a single issue found by the Reviewer.
 *
 * - hallucination:    Worker added code or logic not justified by the task
 * - regression:       Worker removed or altered existing behaviour without
 *                     justification, or broke a test that used to pass
 * - test_failure:     Worker's own tests do not all pass (TDD was skipped
 *                     or the implementation missed a case)
 * - lint_violation:   ESLint/Prettier/style violations not caught by pre-commit
 * - type_error:       TypeScript compilation errors in the diff
 * - security:         Hardcoded secret, SQLi, XSS, or other OWASP finding
 * - incomplete:       Worker did not address all acceptance criteria
 * - quality:          Code quality concern (readability, performance, idiom)
 */
export type ReviewIssueCategory =
  | "hallucination"
  | "regression"
  | "test_failure"
  | "lint_violation"
  | "type_error"
  | "security"
  | "incomplete"
  | "quality";

/**
 * Score on a 0–10 scale indicating the overall quality of the worker output.
 *
 * | Range  | Meaning                                      |
 * |--------|----------------------------------------------|
 * | 9–10   | Excellent — clean, correct, well-tested      |
 * | 7–8    | Good — minor nits, no blocking issues        |
 * | 5–6    | Acceptable — some issues, non-blocking       |
 * | 3–4    | Poor — blocking issues, needs rework         |
 * | 0–2    | Failing — major problems, must not merge     |
 *
 * Scores ≥ PASS_THRESHOLD (7) are considered passing.
 */
export type ReviewScore = number;

/**
 * Default threshold below which a PR is blocked from creation.
 * Scores ≥ 7 pass; scores ≤ 6 block.
 */
export const PASS_THRESHOLD = 7;

/**
 * The final verdict produced by a Reviewer sub-agent.
 */
export interface ReviewVerdict {
  /**
   * Overall pass/fail decision.
   * - "pass": Output is acceptable — proceed to PR creation.
   * - "flag":  Output has issues — block PR creation and handle per retry policy.
   */
  readonly verdict: "pass" | "flag";

  /**
   * Numeric quality score (0–10). See ReviewScore JSDoc for the rubric.
   * Scores ≥ PASS_THRESHOLD (7) should map to verdict "pass".
   */
  readonly score: ReviewScore;

  /** Specific issues found, if any. Empty array when verdict is "pass". */
  readonly issues: readonly ReviewIssue[];

  /**
   * Optional summary of what the worker did well (for positive feedback /
   * reward-model training signals).
   */
  readonly strengths?: string;

  /** Free-text qualitative assessment. */
  readonly assessment: string;

  /** ISO-8601 timestamp of when the verdict was produced. */
  readonly reviewedAt: string;
}

/**
 * Outcome of a single review cycle — the verdict plus metadata the
 * implement-queue needs for dispatch decisions.
 */
export interface ReviewOutcome {
  /** The raw verdict from the Reviewer sub-agent. */
  readonly verdict: ReviewVerdict;

  /** Total cost in USD for running this review (LLM calls only). */
  readonly costUsd: number;

  /** Wall-clock duration of the review in milliseconds. */
  readonly durationMs: number;

  /** Number of retry attempts already consumed for this piece of work. */
  readonly retryCount: number;
}

/**
 * Action the implement-queue should take after a flagged review.
 */
export type ReviewRetryAction =
  /** Send the work back to the same worker with the Reviewer's feedback. */
  | "retry"
  /** File a GitHub issue for human triage. */
  | "file_issue"
  /** Skip this PR and continue — use sparingly, only for known false positives. */
  | "skip";

/**
 * Configuration guiding the retry policy after a flagged review.
 */
export interface ReviewRetryPolicy {
  /** Maximum number of retries before escalating. Default: 1. */
  readonly maxRetries: number;

  /**
   * Action to take on each successive failure:
   *   retryCount 0 → first action in the array
   *   retryCount 1 → second action
   *   ...
   *   retryCount >= actions.length → last action repeated
   * Default: ["retry", "file_issue"]
   */
  readonly actions: readonly ReviewRetryAction[];
}

export const DEFAULT_REVIEW_RETRY_POLICY: ReviewRetryPolicy = {
  maxRetries: 1,
  actions: ["retry", "file_issue"],
};
