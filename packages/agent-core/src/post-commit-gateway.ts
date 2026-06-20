import { trace } from "@opentelemetry/api";
import { runVerification } from "./worktree-manager.js";
import { storeVerificationLog, emitEvent } from "./utils.js";
import { isTrivialDepBump } from "./dep-bump-merger.js";
import { GateRunner } from "./gate-runner.js";
import type { GateContext } from "./gate-runner.js";
import { StaticAnalysisGate } from "./gates/static-analysis-gate.js";
import { LlmEvaluationGate } from "./gates/llm-evaluation-gate.js";
import { SecurityReviewGate } from "./gates/security-review-gate.js";
import type { EvaluationResult } from "./success-evaluator.js";
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
 * Steps:
 *   1. Verification (lint + typecheck + tests)
 *   2. Quality gates via GateRunner:
 *      a. Static analysis (regex-based, no AI)
 *      b. LLM evaluation (skip-policy absorbed inside evaluateSuccess)
 *      c. Security review (skips when static analysis failed, via previousResults)
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

  // ── Step 2: Quality gates via GateRunner ─────────────────────────────────
  // SecurityReviewGate skips when static analysis failed — expressed via
  // shouldSkip(context, previousResults), no mutable closures needed.
  const gateContext: GateContext = {
    diff,
    taskDescription,
    commitMsg,
    evaluateSuccess: config.evaluateSuccess !== false,
    runStaticAnalysis: config.runStaticAnalysis !== false,
    runSecurityReview: config.runSecurityReview !== false,
  };

  const runner = new GateRunner([
    new StaticAnalysisGate(),
    new LlmEvaluationGate(),
    new SecurityReviewGate(),
  ]);
  const gateRunResult = await runner.run(gateContext);

  // Collect failures and errors from gate results; emit events per gate
  for (const gateResult of gateRunResult.results) {
    if (gateResult.details === "skipped") continue;

    if (!gateResult.passed) {
      gateFailures.push(gateResult.gateName);
      if (gateResult.details) {
        errors.push(gateResult.details);
        const eventType =
          gateResult.gateName === "evaluation"
            ? "session:evaluation"
            : gateResult.gateName === "security-review"
              ? "session:review"
              : "session:verification";
        emitEvent(onEvent, eventType, { message: gateResult.details });
      }
    } else {
      // Emit pass events for certain gates
      if (gateResult.gateName === "evaluation" && gateResult.details) {
        emitEvent(onEvent, "session:evaluation", { message: gateResult.details });
      } else if (gateResult.gateName === "static-analysis" && gateResult.details) {
        emitEvent(onEvent, "session:verification", { message: gateResult.details });
      }
    }
  }

  // Extract the EvaluationResult from the evaluation gate's output field.
  // No mutable instance state: callers find domain data in the results array by gate name.
  const evalGateResult = gateRunResult.results.find((r) => r.gateName === "evaluation");
  const evaluation = evalGateResult?.output as EvaluationResult | undefined;

  const allGatesPass = gateFailures.length === 0;

  if (!allGatesPass) {
    return { outcome: "create-draft-pr", passed: false, gateFailures, errors, evaluation };
  }

  // ── Step 3: Determine merge strategy ─────────────────────────────────────
  const depBumpCheck = isTrivialDepBump(diff);
  if (depBumpCheck.isTrivial) {
    return { outcome: "merge-direct", passed: true, gateFailures: [], errors: [], evaluation };
  }

  return { outcome: "create-pr", passed: true, gateFailures: [], errors: [], evaluation };
}
