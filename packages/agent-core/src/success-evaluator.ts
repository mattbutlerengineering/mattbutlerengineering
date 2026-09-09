import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { resolveModelId } from "./model-registry.js";
import { buildEvaluationPrompt } from "./evaluation-prompt-builder.js";
import { evaluationSkipDecision } from "./evaluation-skip-policy.js";
import type { SkipPolicyInput, SkipReason } from "./evaluation-skip-policy.js";

const execFileAsync = promisify(execFile);

/** Bound the `git diff` subprocess call so a hang fails fast. */
const GIT_TIMEOUT_MS = 60_000;

// ── Types ───────────────────────────────────────────────────────────

export interface EvaluationResult {
  readonly passed: boolean;
  readonly confidence: number;
  readonly reasoning: string;
  readonly issues: readonly string[];
  /** True when the skip policy fired and no LLM call was made. */
  readonly skipped?: boolean;
  /** Which skip condition fired, when `skipped` is true. */
  readonly skipReason?: SkipReason;
  /**
   * True when the LLM judge could not run at all — a non-`success` SDK
   * result, missing/malformed `structured_output`, or a thrown error.
   * Fails closed (`passed: false`): an outage must never be indistinguishable
   * from a genuine pass. Never set together with `skipped`, which marks the
   * deliberate, by-design skip policy rather than a failure.
   */
  readonly evaluationFailed?: boolean;
}

export interface EvaluationConfig {
  readonly model: string;
  readonly maxBudgetUsd: number;
}

export const DEFAULT_EVALUATION_CONFIG: EvaluationConfig = {
  model: resolveModelId("haiku"),
  maxBudgetUsd: 0.05,
};

/**
 * Result for the deliberate skip policy (trivial diffs, dep bumps,
 * test-only changes) — a by-design cost optimization, not a failure. This
 * is the ONLY case where an unevaluated diff is still reported as a pass;
 * see `evaluationFailedResult` below for the fail-closed counterpart used
 * when the LLM judge itself could not run.
 */
const SKIP_RESULT: EvaluationResult = {
  passed: true,
  confidence: 0,
  reasoning: "Evaluation unavailable — defaulting to pass",
  issues: [],
};

/**
 * Fail-closed result for when the LLM judge could not run: a non-`success`
 * SDK result, missing/malformed `structured_output`, or a thrown error.
 * `passed: false` so the gate blocks the PR from leaving draft, per the
 * package's "all gates must pass for a non-draft PR" rule — an inconclusive
 * evaluation must never read the same as a genuine pass. Logs the failure
 * so an operator can tell an outage from a clean run.
 */
function evaluationFailedResult(reason: string, error?: unknown): EvaluationResult {
  const detail =
    error === undefined ? undefined : error instanceof Error ? error.message : String(error);
  console.error(`[success-evaluator] LLM evaluation could not run: ${reason}`, error ?? "");
  return {
    passed: false,
    confidence: 0,
    reasoning: detail ? `${reason}: ${detail}` : reason,
    issues: ["LLM evaluation could not run"],
    evaluationFailed: true,
  };
}

// ── Evaluation ──────────────────────────────────────────────────────

const EVALUATION_SCHEMA = {
  type: "object" as const,
  properties: {
    passed: {
      type: "boolean" as const,
      description: "Whether the diff adequately addresses the task",
    },
    confidence: {
      type: "number" as const,
      description: "Confidence in the evaluation (0.0 to 1.0)",
    },
    reasoning: {
      type: "string" as const,
      description: "Brief explanation of the evaluation",
    },
    issues: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "Specific problems found, if any",
    },
  },
  required: ["passed", "confidence", "reasoning", "issues"] as const,
  additionalProperties: false as const,
};

export async function getGitDiff(worktreePath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["diff", "HEAD~1..HEAD"], {
      cwd: worktreePath,
      maxBuffer: 10 * 1024 * 1024,
      timeout: GIT_TIMEOUT_MS,
    });
    return stdout;
  } catch {
    return "";
  }
}

/** Config for {@link evaluateSuccess}: LLM tuning plus skip-policy inputs. */
export type EvaluateSuccessConfig = Partial<EvaluationConfig> & Omit<SkipPolicyInput, "diff">;

/**
 * Evaluate whether a diff addresses a task via an LLM judge.
 *
 * The skip policy is absorbed internally: callers no longer pre-check
 * whether to evaluate. When the policy fires, this returns the deliberate
 * skip result (`passed: true, confidence: 0`) plus the additive
 * `skipped: true` / `skipReason` markers, WITHOUT calling the LLM. Pass
 * `testsPassed` / `commitTitle` via `config` to drive the skip decision.
 *
 * When the LLM judge itself fails to run — a non-`success` SDK result,
 * missing/malformed `structured_output`, or a thrown error — this fails
 * closed (`passed: false, confidence: 0, evaluationFailed: true`) instead,
 * so an outage is never indistinguishable from a genuine pass.
 *
 * The empty-diff branch is preserved unchanged (`passed: false,
 * confidence: 1.0`) and takes precedence over the skip markers.
 */
export async function evaluateSuccess(
  taskDescription: string,
  gitDiff: string,
  config?: EvaluateSuccessConfig
): Promise<EvaluationResult> {
  if (!gitDiff.trim()) {
    return {
      passed: false,
      confidence: 1.0,
      reasoning: "No changes in diff — nothing to evaluate",
      issues: ["Empty diff"],
    };
  }

  const skip = evaluationSkipDecision({
    diff: gitDiff,
    testsPassed: config?.testsPassed,
    commitTitle: config?.commitTitle,
  });
  if (skip.skip) {
    return { ...SKIP_RESULT, skipped: true, skipReason: skip.reason };
  }

  const mergedConfig = { ...DEFAULT_EVALUATION_CONFIG, ...config };

  try {
    const prompt = buildEvaluationPrompt(taskDescription, gitDiff);

    const conversation = query({
      prompt,
      options: {
        model: mergedConfig.model,
        maxTurns: 1,
        maxBudgetUsd: mergedConfig.maxBudgetUsd,
        permissionMode: "plan",
        systemPrompt: "You are a code review evaluator. Respond only with the requested JSON.",
        outputFormat: {
          type: "json_schema",
          schema: EVALUATION_SCHEMA,
        },
      },
    });

    let result: SDKResultMessage | null = null;
    for await (const message of conversation) {
      if (message.type === "result") {
        result = message;
      }
    }

    if (!result || result.subtype !== "success") {
      return evaluationFailedResult(
        `LLM evaluation returned a non-success result (subtype: ${result?.subtype ?? "none"})`
      );
    }

    const parsed = result.structured_output as
      | {
          passed: boolean;
          confidence: number;
          reasoning: string;
          issues: string[];
        }
      | undefined;

    if (!parsed || typeof parsed.passed !== "boolean") {
      return evaluationFailedResult("LLM evaluation returned malformed structured_output");
    }

    return {
      passed: parsed.passed,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      reasoning: parsed.reasoning ?? "",
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  } catch (error) {
    return evaluationFailedResult("LLM evaluation threw", error);
  }
}
