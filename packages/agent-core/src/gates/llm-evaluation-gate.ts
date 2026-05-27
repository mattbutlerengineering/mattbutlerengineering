import { trace } from "@opentelemetry/api";
import { evaluateSuccess, shouldEvaluate } from "../success-evaluator.js";
import { emitEvent } from "../utils.js";
import type { SessionEventCallback } from "../types.js";
import type { GateContext, GateResult, QualityGate } from "../gate-runner.js";

const tracer = trace.getTracer("@mbe/agent-core");

/**
 * LLM-as-judge gate. Skipped for trivial diffs.
 * Adds evaluation result and errors when evaluation fails.
 */
export class LlmEvaluationGate implements QualityGate {
  private result: Partial<GateResult> = {};

  async run(ctx: GateContext, onEvent?: SessionEventCallback): Promise<void> {
    if (ctx.evaluateSuccess === false) {
      return;
    }

    if (!shouldEvaluate(ctx.diff, { commitTitle: ctx.commitMsg })) {
      emitEvent(onEvent, "session:evaluation", {
        message: "Evaluation skipped — trivial diff",
      });
      return;
    }

    const errors: string[] = [];
    const evalSpan = tracer.startSpan("agent_core.evaluate_success");
    try {
      const evaluation = await evaluateSuccess(ctx.taskDescription, ctx.diff);
      evalSpan.setAttribute("evaluation.passed", evaluation.passed);
      evalSpan.setAttribute("evaluation.confidence", evaluation.confidence);

      emitEvent(onEvent, "session:evaluation", {
        message: `Evaluation: ${evaluation.passed ? "PASS" : "FAIL"} (confidence: ${evaluation.confidence.toFixed(2)})`,
      });

      if (!evaluation.passed) {
        errors.push(`Evaluation failed: ${evaluation.reasoning}`);
      }

      this.result = { evaluation, errors };
    } finally {
      evalSpan.end();
    }
  }

  getResult(): Partial<GateResult> {
    return this.result;
  }
}
