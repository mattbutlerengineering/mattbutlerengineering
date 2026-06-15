import { trace } from "@opentelemetry/api";
import { runVerification } from "./worktree-manager.js";
import { storeVerificationLog, emitEvent } from "./utils.js";
import { analyzeDiff } from "./diff-static-analyzer.js";
import { evaluateSuccess } from "./success-evaluator.js";
import type { EvaluationResult } from "./success-evaluator.js";
import { reviewDiff } from "./diff-reviewer.js";
import { isTrivialDepBump } from "./dep-bump-merger.js";
import type { SessionEventCallback } from "./types.js";

const tracer = trace.getTracer("@mbe/agent-core");

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
 * Inline steps:
 *   1. Verification (lint + typecheck + tests)
 *   2. Static analysis (regex-based, no AI)
 *   3. LLM evaluation (skip-policy absorbed inside evaluateSuccess)
 *   4. Security review (skipped when static analysis failed)
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

  // ── Step 1: Verification (lint + typecheck + tests) ──────────────────────
  const verifySpan = tracer.startSpan("agent_core.verify_changes");
  let verificationPassed: boolean;
  try {
    const verification = await runVerification(worktreePath);
    verifySpan.setAttribute("verify.passed", verification.passed);
    verifySpan.setAttribute("verify.lint", verification.lintOk);
    verifySpan.setAttribute("verify.typecheck", verification.typecheckOk);
    verifySpan.setAttribute("verify.tests", verification.testsOk);

    const logSections: { label: string; output: string }[] = [];
    if (verification.lintOutput)
      logSections.push({ label: "Lint", output: verification.lintOutput });
    if (verification.typecheckOutput)
      logSections.push({ label: "Typecheck", output: verification.typecheckOutput });
    if (verification.testOutput)
      logSections.push({ label: "Tests", output: verification.testOutput });

    let verificationLogPath: string | undefined;
    if (logSections.length > 0) {
      verificationLogPath = await storeVerificationLog(worktreePath, logSections);
    }

    emitEvent(onEvent, "session:verification", {
      message: verification.passed
        ? "Verification passed (lint + typecheck + tests)"
        : `Verification failed — lint: ${verification.lintOk ? "OK" : "FAIL"}, typecheck: ${verification.typecheckOk ? "OK" : "FAIL"}, tests: ${verification.testsOk ? "OK" : "FAIL"}${verificationLogPath ? ` (full log: ${verificationLogPath})` : ""}`,
    });

    verificationPassed = verification.passed;
    if (!verification.passed) {
      gateFailures.push("verification");
      const parts: string[] = [];
      if (!verification.lintOk) parts.push(`lint: ${verification.lintOutput}`);
      if (!verification.typecheckOk) parts.push(`typecheck: ${verification.typecheckOutput}`);
      if (!verification.testsOk) parts.push(`tests: ${verification.testOutput}`);
      errors.push(`Verification failed: ${parts.join("; ")}`);
    }
  } finally {
    verifySpan.end();
  }

  // Quality gates only run when verification passed
  if (!verificationPassed) {
    return { outcome: "create-draft-pr", passed: false, gateFailures, errors };
  }

  let evaluation: EvaluationResult | undefined;

  // ── Step 2: Static analysis ───────────────────────────────────────────────
  let staticAnalysisPassed = true;
  if (config.runStaticAnalysis !== false) {
    const staticSpan = tracer.startSpan("agent_core.static_analysis_gate");
    try {
      const analysisResult = analyzeDiff(diff);
      const errorViolations = analysisResult.violations.filter((v) => v.severity === "error");
      staticAnalysisPassed = errorViolations.length === 0;

      staticSpan.setAttribute("static_analysis.clean", analysisResult.clean);
      staticSpan.setAttribute("static_analysis.violation_count", analysisResult.violations.length);
      staticSpan.setAttribute("static_analysis.error_count", errorViolations.length);

      if (!staticAnalysisPassed) {
        const formatted = errorViolations
          .map((v) => `${v.file}:${v.line} [${v.rule}] ${v.message}`)
          .join("; ");
        const details = `Static analysis errors: ${formatted}`;
        gateFailures.push("static-analysis");
        errors.push(details);
        emitEvent(onEvent, "session:verification", { message: details });
      } else if (!analysisResult.clean) {
        const warnCount = analysisResult.violations.filter((v) => v.severity === "warning").length;
        emitEvent(onEvent, "session:verification", {
          message: `${warnCount} warning(s) (non-blocking)`,
        });
      }
    } finally {
      staticSpan.end();
    }
  }

  // ── Step 3: LLM evaluation ────────────────────────────────────────────────
  if (config.evaluateSuccess !== false) {
    const evalSpan = tracer.startSpan("agent_core.llm_evaluation_gate");
    try {
      const evalResult = await evaluateSuccess(taskDescription, diff, { commitTitle: commitMsg });
      evaluation = evalResult;

      evalSpan.setAttribute("evaluation.passed", evalResult.passed);
      evalSpan.setAttribute("evaluation.confidence", evalResult.confidence);
      if (evalResult.skipped) {
        evalSpan.setAttribute("evaluation.skipped", true);
      }

      if (!evalResult.passed) {
        const details = `Evaluation failed: ${evalResult.reasoning}`;
        gateFailures.push("evaluation");
        errors.push(details);
        emitEvent(onEvent, "session:evaluation", { message: details });
      } else {
        emitEvent(onEvent, "session:evaluation", {
          message: `confidence: ${evalResult.confidence.toFixed(2)}`,
        });
      }
    } finally {
      evalSpan.end();
    }
  }

  // ── Step 4: Security review (skipped when static analysis failed) ─────────
  if (config.runSecurityReview !== false && staticAnalysisPassed) {
    const secSpan = tracer.startSpan("agent_core.security_review_gate");
    try {
      const reviewResult = await reviewDiff(diff);

      secSpan.setAttribute("security_review.approved", reviewResult.approved);
      secSpan.setAttribute("security_review.issues_count", reviewResult.issues.length);

      if (!reviewResult.approved) {
        const details = `Security review failed: ${reviewResult.issues.join("; ")}`;
        gateFailures.push("security-review");
        errors.push(details);
        emitEvent(onEvent, "session:review", { message: details });
      }
    } finally {
      secSpan.end();
    }
  }

  const allGatesPass = gateFailures.length === 0;

  if (!allGatesPass) {
    return { outcome: "create-draft-pr", passed: false, gateFailures, errors, evaluation };
  }

  // ── Step 5: Determine merge strategy ─────────────────────────────────────
  const depBumpCheck = isTrivialDepBump(diff);
  if (depBumpCheck.isTrivial) {
    return { outcome: "merge-direct", passed: true, gateFailures: [], errors: [], evaluation };
  }

  return { outcome: "create-pr", passed: true, gateFailures: [], errors: [], evaluation };
}
