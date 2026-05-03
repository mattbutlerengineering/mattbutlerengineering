import { trace } from "@opentelemetry/api";
import { evaluateSuccess, shouldEvaluate } from "./success-evaluator.js";
import type { EvaluationResult } from "./success-evaluator.js";
import { reviewDiff } from "./diff-reviewer.js";
import type { ReviewResult } from "./diff-reviewer.js";
import { analyzeDiff } from "./diff-static-analyzer.js";
import { emitEvent } from "./utils.js";
import type { SessionEventCallback } from "./types.js";

const tracer = trace.getTracer("@mbe/agent-core");

export interface QualityGatesResult {
  evaluation?: EvaluationResult;
  securityReview?: ReviewResult;
  staticAnalysisClean: boolean;
  errors: string[];
}

/**
 * Run LLM evaluation, static analysis, and security review on the diff.
 */
export async function runQualityGates(
  taskDescription: string,
  diff: string,
  commitMsg: string,
  options: {
    evaluateSuccess?: boolean;
    runSecurityReview?: boolean;
    runStaticAnalysis?: boolean;
  },
  onEvent?: SessionEventCallback
): Promise<QualityGatesResult> {
  const result: QualityGatesResult = {
    staticAnalysisClean: true,
    errors: [],
  };

  // 1. Static analysis (fast, local)
  if (options.runStaticAnalysis !== false) {
    const staticResult = analyzeDiff(diff);
    result.staticAnalysisClean = staticResult.clean;

    const errorViolations = staticResult.violations.filter((v) => v.severity === "error");
    if (errorViolations.length > 0) {
      const formatted = errorViolations
        .map((v) => `${v.file}:${v.line} [${v.rule}] ${v.message}`)
        .join("; ");
      result.errors.push(`Static analysis errors: ${formatted}`);
      emitEvent(onEvent, "session:verification", {
        message: `Static analysis: ${errorViolations.length} error(s) — ${formatted}`,
      });
    } else if (!staticResult.clean) {
      emitEvent(onEvent, "session:verification", {
        message: `Static analysis: ${staticResult.violations.length} warning(s) (non-blocking)`,
      });
    }
  }

  // 2. LLM Success Evaluation
  if (options.evaluateSuccess !== false) {
    if (!shouldEvaluate(diff, { commitTitle: commitMsg })) {
      emitEvent(onEvent, "session:evaluation", {
        message: "Evaluation skipped — trivial diff",
      });
    } else {
      const evalSpan = tracer.startSpan("agent_core.evaluate_success");
      try {
        result.evaluation = await evaluateSuccess(taskDescription, diff);
        evalSpan.setAttribute("evaluation.passed", result.evaluation.passed);
        evalSpan.setAttribute("evaluation.confidence", result.evaluation.confidence);
      } finally {
        evalSpan.end();
      }

      emitEvent(onEvent, "session:evaluation", {
        message: `Evaluation: ${result.evaluation.passed ? "PASS" : "FAIL"} (confidence: ${result.evaluation.confidence.toFixed(2)})`,
      });

      if (!result.evaluation.passed) {
        result.errors.push(`Evaluation failed: ${result.evaluation.reasoning}`);
      }
    }
  }

  // 3. AI Security Review
  if (options.runSecurityReview !== false && result.staticAnalysisClean) {
    const reviewSpan = tracer.startSpan("agent_core.security_review");
    try {
      result.securityReview = await reviewDiff(diff);
      reviewSpan.setAttribute("review.approved", result.securityReview.approved);
      reviewSpan.setAttribute("review.issues_count", result.securityReview.issues.length);

      emitEvent(onEvent, "session:review", {
        message: result.securityReview.approved
          ? "Security review: APPROVED"
          : `Security review: BLOCKED — ${result.securityReview.issues.join("; ")}`,
      });

      if (!result.securityReview.approved) {
        result.errors.push(`Security review failed: ${result.securityReview.issues.join("; ")}`);
      }
    } finally {
      reviewSpan.end();
    }
  }

  return result;
}
