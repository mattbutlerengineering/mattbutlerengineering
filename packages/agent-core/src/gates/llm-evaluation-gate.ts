import { trace } from "@opentelemetry/api";
import { evaluateSuccess } from "../success-evaluator.js";
import type { EvaluationResult } from "../success-evaluator.js";
import type { GateContext, GateResult, QualityGate } from "../gate-runner.js";

const tracer = trace.getTracer("@mbe/agent-core");

/**
 * Wraps the LLM-as-judge success evaluator as a QualityGate.
 *
 * The skip policy is absorbed inside `evaluateSuccess`: when the policy
 * fires, `evaluateSuccess` returns the inconclusive `skipped` result and
 * the gate passes.
 *
 * After `evaluate()` runs, `lastResult` holds the full EvaluationResult
 * so callers can read it without triggering a second LLM call.
 */
export class LlmEvaluationGate implements QualityGate {
  readonly name = "evaluation";

  /** Set after evaluate() completes. Undefined before the gate runs. */
  lastResult: EvaluationResult | undefined;

  shouldSkip(context: GateContext): boolean {
    return context.evaluateSuccess === false;
  }

  async evaluate(context: GateContext): Promise<GateResult> {
    const span = tracer.startSpan("agent_core.llm_evaluation_gate");
    try {
      const evalResult = await evaluateSuccess(context.taskDescription, context.diff, {
        commitTitle: context.commitMsg,
      });

      this.lastResult = evalResult;

      span.setAttribute("evaluation.passed", evalResult.passed);
      span.setAttribute("evaluation.confidence", evalResult.confidence);
      if (evalResult.skipped) {
        span.setAttribute("evaluation.skipped", true);
      }

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
