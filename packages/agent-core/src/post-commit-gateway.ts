import { orchestrateVerification } from "./verification-orchestrator.js";
import { GateRunner } from "./gate-runner.js";
import type { GateContext } from "./gate-runner.js";
import { StaticAnalysisGate } from "./gates/static-analysis-gate.js";
import { LlmEvaluationGate } from "./gates/llm-evaluation-gate.js";
import { SecurityReviewGate } from "./gates/security-review-gate.js";
import { isTrivialDepBump } from "./dep-bump-merger.js";
import { emitEvent } from "./utils.js";
import type { SessionEventCallback } from "./types.js";
import type { EvaluationResult } from "./success-evaluator.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type GatewayOutcome = "merge-direct" | "create-pr" | "create-draft-pr";

export interface GatewayVerdict {
  outcome: GatewayOutcome;
  passed: boolean;
  /** Names of gates that failed, e.g. ["verification", "static-analysis"] */
  gateFailures: string[];
  /** Human-readable failure messages collected from verification + quality gates */
  errors: string[];
  /**
   * LLM evaluation result. Undefined when the evaluation gate did not run
   * (e.g. `evaluateSuccess` disabled or verification failed). When the skip
   * policy fires, this is present with `skipped: true`.
   */
  evaluation?: EvaluationResult;
}

export interface PostCommitGatewayConfig {
  evaluateSuccess?: boolean;
  runSecurityReview?: boolean;
  runStaticAnalysis?: boolean;
}

export interface PostCommitGatewayInput {
  worktreePath: string;
  diff: string;
  commitMsg: string;
  taskDescription: string;
  config: PostCommitGatewayConfig;
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Run all post-commit validation gates and determine the PR outcome.
 *
 * Returns a GatewayVerdict with:
 *   - `outcome`: "merge-direct" | "create-pr" | "create-draft-pr"
 *   - `passed`: true when all gates passed
 *   - `gateFailures`: names of gates that failed
 *   - `errors`: human-readable messages collected from all gates
 */
export async function runPostCommitGateway(
  input: PostCommitGatewayInput,
  onEvent?: SessionEventCallback
): Promise<GatewayVerdict> {
  const { worktreePath, diff, commitMsg, taskDescription, config } = input;
  const errors: string[] = [];
  const gateFailures: string[] = [];

  // 1. Verification (lint + typecheck + tests)
  const verification = await orchestrateVerification(worktreePath, onEvent);
  if (!verification.passed) {
    gateFailures.push("verification");
    if (verification.error) errors.push(verification.error);
  }

  // 2. Quality gates via GateRunner — only run when verification passed
  let evaluation: EvaluationResult | undefined;
  if (verification.passed) {
    const staticGate = new StaticAnalysisGate();
    const evalGate = new LlmEvaluationGate();
    const securityGate = new SecurityReviewGate({
      skipWhen: () => staticGate.lastResult !== undefined && !staticGate.lastResult.passed,
    });

    const context: GateContext = {
      diff,
      taskDescription,
      commitMsg,
      evaluateSuccess: config.evaluateSuccess !== false,
      runStaticAnalysis: config.runStaticAnalysis !== false,
      runSecurityReview: config.runSecurityReview !== false,
    };

    const gateRunResult = await new GateRunner([staticGate, evalGate, securityGate]).run(context);
    evaluation = evalGate.lastEvaluation;

    for (const result of gateRunResult.results) {
      if (!result.passed) {
        gateFailures.push(result.gateName);
        if (result.details) errors.push(result.details);
      }
      if (result.details && result.details !== "skipped") {
        const eventType =
          result.gateName === "static-analysis"
            ? "session:verification"
            : result.gateName === "evaluation"
              ? "session:evaluation"
              : "session:review";
        emitEvent(onEvent, eventType, { message: result.details });
      }
    }
  }

  const allGatesPass = gateFailures.length === 0;

  if (!allGatesPass) {
    return { outcome: "create-draft-pr", passed: false, gateFailures, errors, evaluation };
  }

  // 3. Determine merge strategy — trivial dep bumps bypass PR review
  const depBumpCheck = isTrivialDepBump(diff);
  if (depBumpCheck.isTrivial) {
    return { outcome: "merge-direct", passed: true, gateFailures: [], errors: [], evaluation };
  }

  return { outcome: "create-pr", passed: true, gateFailures: [], errors: [], evaluation };
}
