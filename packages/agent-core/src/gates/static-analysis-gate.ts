import { analyzeDiff } from "../diff-static-analyzer.js";
import { emitEvent } from "../utils.js";
import type { SessionEventCallback } from "../types.js";
import type { GateContext, GateResult, QualityGate } from "../gate-runner.js";

/**
 * Fast regex-based static analysis gate. No LLM cost.
 * Marks staticAnalysisClean=false and adds errors for error-severity violations.
 */
export class StaticAnalysisGate implements QualityGate {
  private result: Partial<GateResult> = {};

  async run(ctx: GateContext, onEvent?: SessionEventCallback): Promise<void> {
    if (ctx.runStaticAnalysis === false) {
      this.result = { staticAnalysisClean: true };
      return;
    }

    const staticResult = analyzeDiff(ctx.diff);
    const errors: string[] = [];

    const errorViolations = staticResult.violations.filter((v) => v.severity === "error");
    if (errorViolations.length > 0) {
      const formatted = errorViolations
        .map((v) => `${v.file}:${v.line} [${v.rule}] ${v.message}`)
        .join("; ");
      errors.push(`Static analysis errors: ${formatted}`);
      emitEvent(onEvent, "session:verification", {
        message: `Static analysis: ${errorViolations.length} error(s) — ${formatted}`,
      });
    } else if (!staticResult.clean) {
      emitEvent(onEvent, "session:verification", {
        message: `Static analysis: ${staticResult.violations.length} warning(s) (non-blocking)`,
      });
    }

    this.result = {
      staticAnalysisClean: staticResult.clean,
      errors,
    };
  }

  getResult(): Partial<GateResult> {
    return this.result;
  }
}
