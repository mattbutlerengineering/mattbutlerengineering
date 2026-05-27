import { orchestrateVerification } from "./verification-orchestrator.js";
import { GateRunner } from "./gate-runner.js";
import { LlmEvaluationGate } from "./gates/llm-evaluation-gate.js";
import { SecurityReviewGate } from "./gates/security-review-gate.js";
import { StaticAnalysisGate } from "./gates/static-analysis-gate.js";
import { isTrivialDepBump } from "./dep-bump-merger.js";
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
  /** LLM evaluation result — undefined when evaluation was skipped or not run */
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

  // 2. Quality gates — only run when verification passed
  let evaluation: EvaluationResult | undefined;
  if (verification.passed) {
    const runner = new GateRunner([
      new StaticAnalysisGate(),
      new LlmEvaluationGate(),
      new SecurityReviewGate(),
    ]);

    const qualityResult = await runner.run(
      {
        taskDescription,
        diff,
        commitMsg,
        evaluateSuccess: config.evaluateSuccess,
        runSecurityReview: config.runSecurityReview,
        runStaticAnalysis: config.runStaticAnalysis,
      },
      onEvent
    );

    errors.push(...qualityResult.errors);
    evaluation = qualityResult.evaluation;

    if (!qualityResult.staticAnalysisClean) gateFailures.push("static-analysis");
    if (qualityResult.evaluation?.passed === false) gateFailures.push("evaluation");
    if (qualityResult.securityReview?.approved === false) gateFailures.push("security-review");
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
