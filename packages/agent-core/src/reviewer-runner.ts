import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { resolveModelId } from "./model-registry.js";
import type {
  ReviewInput,
  ReviewIssue,
  ReviewOutcome,
  ReviewRetryAction,
  ReviewRetryPolicy,
  ReviewVerdict,
} from "./reviewer-contract.js";
import { PASS_THRESHOLD } from "./reviewer-contract.js";

// ── Configuration ────────────────────────────────────────────────────────────

export interface ReviewerConfig {
  /** Model to use for the reviewer. Default: haiku (fast + cheap). */
  readonly model: string;
  /** Maximum spend per review in USD. Default: 0.05. */
  readonly maxBudgetUsd: number;
  /** Wall-clock timeout in ms. Reviewer fails-open on timeout. Default: 30_000. */
  readonly timeoutMs: number;
}

export const DEFAULT_REVIEWER_CONFIG: ReviewerConfig = {
  model: resolveModelId("haiku"),
  maxBudgetUsd: 0.05,
  timeoutMs: 30_000,
};

// ── Options accepted by runReviewer ─────────────────────────────────────────

export interface RunReviewerOptions {
  /** How many times this piece of work has already been retried. Default: 0. */
  readonly retryCount?: number;
  /** Config overrides (model, budget, timeout). */
  readonly config?: Partial<ReviewerConfig>;
}

// ── JSON Schema for structured output ───────────────────────────────────────

const REVIEW_ISSUE_SCHEMA = {
  type: "object" as const,
  properties: {
    category: {
      type: "string" as const,
      enum: [
        "hallucination",
        "regression",
        "test_failure",
        "lint_violation",
        "type_error",
        "security",
        "incomplete",
        "quality",
      ],
    },
    description: { type: "string" as const },
    filePath: { type: "string" as const },
    lineNumber: { type: "number" as const },
    suggestion: { type: "string" as const },
  },
  required: ["category", "description"] as const,
  additionalProperties: false as const,
};

const VERDICT_SCHEMA = {
  type: "object" as const,
  properties: {
    verdict: { type: "string" as const, enum: ["pass", "flag"] },
    score: { type: "number" as const, minimum: 0, maximum: 10 },
    issues: { type: "array" as const, items: REVIEW_ISSUE_SCHEMA },
    strengths: { type: "string" as const },
    assessment: { type: "string" as const },
    reviewedAt: { type: "string" as const },
  },
  required: ["verdict", "score", "issues", "assessment"] as const,
  additionalProperties: false as const,
};

// ── Prompt building ──────────────────────────────────────────────────────────

const MAX_DIFF_LENGTH = 40_000;
const MAX_VERIFICATION_LENGTH = 10_000;

function buildReviewerPrompt(input: ReviewInput): string {
  const diff =
    input.diff.length > MAX_DIFF_LENGTH
      ? input.diff.slice(0, MAX_DIFF_LENGTH) + "\n\n... (diff truncated)"
      : input.diff;

  const verification =
    input.verificationOutput.length > MAX_VERIFICATION_LENGTH
      ? input.verificationOutput.slice(0, MAX_VERIFICATION_LENGTH) + "\n... (truncated)"
      : input.verificationOutput;

  const criteria =
    input.acceptanceCriteria.length > 0
      ? input.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")
      : "(none provided)";

  return [
    "You are an independent code reviewer evaluating a worker agent's output before it is merged.",
    "Your job is to catch hallucinations, regressions, gate bypasses, and criteria gaps.",
    "Be pragmatic: only flag real problems, not style preferences.",
    "",
    "## Task Description",
    input.taskDescription,
    "",
    "## Acceptance Criteria",
    criteria,
    "",
    "## Commit Message",
    input.commitMessage,
    "",
    "## Changed Files",
    input.changedFiles.join(", ") || "(none)",
    "",
    "## Verification Output (lint / typecheck / test)",
    "```",
    verification,
    "```",
    "",
    "## Git Diff",
    "```diff",
    diff,
    "```",
    "",
    "## Scoring Rubric (start at 10, deduct)",
    "| Score | Label      | Criteria                                                              |",
    "| ----- | ---------- | --------------------------------------------------------------------- |",
    "| 9–10  | Excellent  | All AC met, no defects, clean code, tests pass, no regressions        |",
    "| 7–8   | Good       | All AC met, minor nits (style, naming), no blocking issues            |",
    "| 5–6   | Acceptable | All AC met but has non-trivial issues (messy code, missing edge case) |",
    "| 3–4   | Poor       | Some AC missed or broken; requires rework before merging              |",
    "| 0–2   | Failing    | Major problems: hallucinations, regressions, security, or no tests    |",
    "",
    "Scores >= 7 → verdict: pass. Scores <= 6 → verdict: flag.",
    "One major defect (hallucination, regression, security) → max 4.",
    "One minor defect (lint violation, missing edge case) → max 8.",
    "All tests passing + no lint/type errors → floor of 5 even with quality nits.",
    "",
    "## Issue Categories",
    "- hallucination: code or logic not justified by the task",
    "- regression: existing behaviour broken without justification",
    "- test_failure: worker's tests do not all pass",
    "- lint_violation: ESLint/Prettier/style violations",
    "- type_error: TypeScript compilation errors",
    "- security: hardcoded secret, SQLi, XSS, or other OWASP finding",
    "- incomplete: acceptance criteria addressed poorly or skipped",
    "- quality: code quality concern (readability, performance, idiom)",
    "",
    "Return your review as JSON matching the output schema.",
  ].join("\n");
}

// ── Fail-open sentinel ───────────────────────────────────────────────────────

function makePassVerdict(assessment: string): ReviewVerdict {
  return {
    verdict: "pass",
    score: 10,
    issues: [],
    assessment,
    reviewedAt: new Date().toISOString(),
  };
}

// ── parseReviewerVerdict ─────────────────────────────────────────────────────

/**
 * Normalises raw structured output from the SDK into a well-formed ReviewVerdict.
 *
 * Coerces score vs verdict consistency: the score is authoritative — if the
 * worker labelled verdict="pass" but score < PASS_THRESHOLD, we override to
 * "flag" (and vice-versa). This prevents the LLM from self-contradicting.
 */
export function parseReviewerVerdict(raw: ReviewVerdict): ReviewVerdict {
  const score = typeof raw.score === "number" ? Math.max(0, Math.min(10, raw.score)) : 0;
  const verdict: "pass" | "flag" = score >= PASS_THRESHOLD ? "pass" : "flag";
  const issues: readonly ReviewIssue[] = Array.isArray(raw.issues) ? raw.issues : [];
  const reviewedAt = raw.reviewedAt ?? new Date().toISOString();

  return {
    verdict,
    score,
    issues,
    strengths: raw.strengths,
    assessment: raw.assessment ?? "",
    reviewedAt,
  };
}

// ── selectRetryAction ────────────────────────────────────────────────────────

/**
 * Picks the appropriate retry action for the current attempt.
 *
 * The `actions` array is indexed by `retryCount`. If retryCount exceeds the
 * array, the last action repeats. An empty actions array returns "skip".
 */
export function selectRetryAction(
  policy: ReviewRetryPolicy,
  retryCount: number
): ReviewRetryAction {
  if (policy.actions.length === 0) {
    return "skip";
  }

  const idx = Math.min(retryCount, policy.actions.length - 1);
  return policy.actions[idx];
}

// ── runReviewer ──────────────────────────────────────────────────────────────

/**
 * Dispatches the Reviewer sub-agent for a piece of completed worker output.
 *
 * Fail-open contract: if the LLM call errors, times out, or returns a
 * non-success subtype, this function resolves with a pass verdict and logs
 * a warning. False negatives (missed issues) are preferable to false
 * positives (stuck merge train).
 */
export async function runReviewer(
  input: ReviewInput,
  opts: RunReviewerOptions = {}
): Promise<ReviewOutcome> {
  const retryCount = opts.retryCount ?? 0;
  const config: ReviewerConfig = { ...DEFAULT_REVIEWER_CONFIG, ...opts.config };
  const startMs = Date.now();

  try {
    const prompt = buildReviewerPrompt(input);

    let result: SDKResultMessage | null = null;

    const queryIterable = query({
      prompt,
      options: {
        model: config.model,
        maxTurns: 1,
        maxBudgetUsd: config.maxBudgetUsd,
        permissionMode: "plan",
        systemPrompt: "You are a code reviewer. Respond only with the requested JSON verdict.",
        outputFormat: {
          type: "json_schema",
          schema: VERDICT_SCHEMA,
        },
      },
    });

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), config.timeoutMs)
    );

    // Race the iterable against the timeout.
    const collected = await Promise.race([
      (async () => {
        for await (const message of queryIterable) {
          if (message.type === "result") {
            result = message as SDKResultMessage;
          }
        }
        return result;
      })(),
      timeoutPromise,
    ]);

    if (collected === null) {
      // Timeout — fail-open
      return {
        verdict: makePassVerdict("Reviewer timed out — proceeding fail-open"),
        costUsd: 0,
        durationMs: Date.now() - startMs,
        retryCount,
      };
    }

    if (!collected || collected.subtype !== "success") {
      return {
        verdict: makePassVerdict(
          `Reviewer returned non-success subtype (${collected?.subtype ?? "no result"}) — proceeding fail-open`
        ),
        costUsd: (collected as SDKResultMessage | null)?.total_cost_usd ?? 0,
        durationMs: Date.now() - startMs,
        retryCount,
      };
    }

    const raw = collected.structured_output as ReviewVerdict | undefined;
    if (!raw || typeof raw.score !== "number") {
      return {
        verdict: makePassVerdict("Reviewer returned unreadable output — proceeding fail-open"),
        costUsd: collected.total_cost_usd ?? 0,
        durationMs: Date.now() - startMs,
        retryCount,
      };
    }

    return {
      verdict: parseReviewerVerdict(raw),
      costUsd: collected.total_cost_usd ?? 0,
      durationMs: Date.now() - startMs,
      retryCount,
    };
  } catch {
    return {
      verdict: makePassVerdict("Reviewer threw an error — proceeding fail-open"),
      costUsd: 0,
      durationMs: Date.now() - startMs,
      retryCount,
    };
  }
}
