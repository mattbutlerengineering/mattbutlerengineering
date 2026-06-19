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
 * The full EvaluationResult is returned in `GateResult.output` so callers
 * can extract it from the results array by gate name — no mutable instance
 * state needed.
 */
export class LlmEvaluationGate implements QualityGate {
  readonly name = "evaluation";

  shouldSkip(context: GateContext): boolean {
    return context.evaluateSuccess === false;
  }

  async evaluate(context: GateContext): Promise<GateResult> {
    const span = tracer.startSpan("agent_core.llm_evaluation_gate");
    try {
      const evalResult = await evaluateSuccess(context.taskDescription, context.diff, {
        commitTitle: context.commitMsg,
      });

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
          output: evalResult satisfies EvaluationResult,
        };
      }

      return {
        passed: true,
        gateName: this.name,
        severity: "error",
        details: `confidence: ${evalResult.confidence.toFixed(2)}`,
        output: evalResult satisfies EvaluationResult,
      };
    } finally {
      span.end();
    }
  }
}
