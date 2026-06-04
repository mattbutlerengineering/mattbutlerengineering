import { trace } from "@opentelemetry/api";
import { evaluateSuccess, shouldEvaluate } from "../success-evaluator.js";
import type { EvaluationResult } from "../success-evaluator.js";
import type { GateContext, GateResult, QualityGate } from "../gate-runner.js";

const tracer = trace.getTracer("@mbe/agent-core");

/**
 * Wraps the LLM-as-judge success evaluator as a QualityGate.
 *
 * Exposes `lastEvaluation` after `evaluate()` for callers that need
 * the full EvaluationResult (e.g. post-commit-gateway verdict).
 */
export class LlmEvaluationGate implements QualityGate {
  readonly name = "evaluation";
  lastEvaluation?: EvaluationResult;

  shouldSkip(context: GateContext): boolean {
    if (context.evaluateSuccess === false) return true;
    return !shouldEvaluate(context.diff, { commitTitle: context.commitMsg });
  }

  async evaluate(context: GateContext): Promise<GateResult> {
    const span = tracer.startSpan("agent_core.llm_evaluation_gate");
    try {
      const evalResult = await evaluateSuccess(context.taskDescription, context.diff);
      this.lastEvaluation = evalResult;

      span.setAttribute("evaluation.passed", evalResult.passed);
      span.setAttribute("evaluation.confidence", evalResult.confidence);

      if (!evalResult.passed) {
        return {
          passed: false,
          gateName: this.name,
          severity: "error",
          details: `Evaluation failed: ${evalResult.reasoning}`,
        };
      }

      return {
        passed: true,
        gateName: this.name,
        severity: "error",
        details: `confidence: ${evalResult.confidence.toFixed(2)}`,
      };
    } finally {
      span.end();
    }
  }
}
