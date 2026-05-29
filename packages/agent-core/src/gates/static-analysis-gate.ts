import { trace } from "@opentelemetry/api";
import { analyzeDiff } from "../diff-static-analyzer.js";
import type { GateContext, GateResult, QualityGate } from "../gate-runner.js";

const tracer = trace.getTracer("@mbe/agent-core");

/**
 * Wraps the fast regex-based diff static analyzer as a QualityGate.
 *
 * Fails (severity="error") only when the diff contains error-level violations.
 * Warning-level violations are non-blocking and surface in the result details.
 *
 * shouldSkip: returns true when runStaticAnalysis=false in the context.
 */
export class StaticAnalysisGate implements QualityGate {
  readonly name = "static-analysis";

  shouldSkip(context: GateContext): boolean {
    return context.runStaticAnalysis === false;
  }

  async evaluate(context: GateContext): Promise<GateResult> {
    const span = tracer.startSpan("agent_core.static_analysis_gate");
    try {
      const analysisResult = analyzeDiff(context.diff);
      const errorViolations = analysisResult.violations.filter((v) => v.severity === "error");
      const passed = errorViolations.length === 0;

      span.setAttribute("static_analysis.clean", analysisResult.clean);
      span.setAttribute("static_analysis.violation_count", analysisResult.violations.length);
      span.setAttribute("static_analysis.error_count", errorViolations.length);

      if (!passed) {
        const formatted = errorViolations
          .map((v) => `${v.file}:${v.line} [${v.rule}] ${v.message}`)
          .join("; ");
        return {
          passed: false,
          gateName: this.name,
          severity: "error",
          details: `Static analysis errors: ${formatted}`,
        };
      }

      if (!analysisResult.clean) {
        const warnCount = analysisResult.violations.filter((v) => v.severity === "warning").length;
        return {
          passed: true,
          gateName: this.name,
          severity: "warning",
          details: `${warnCount} warning(s) (non-blocking)`,
        };
      }

      return { passed: true, gateName: this.name, severity: "error" };
    } finally {
      span.end();
    }
  }
}
