import { trace } from "@opentelemetry/api";
import { reviewDiff } from "../diff-reviewer.js";
import type { GateContext, GateResult, QualityGate } from "../gate-runner.js";

const tracer = trace.getTracer("@mbe/agent-core");

/**
 * Wraps the AI security reviewer as a QualityGate.
 *
 * Cross-gate skip dependency: skips when the static-analysis gate failed.
 * This is expressed via `shouldSkip(context, previousResults)` — the prior
 * results are part of the gate context, not a captured closure over a
 * concrete `StaticAnalysisGate` instance.
 */
export class SecurityReviewGate implements QualityGate {
  readonly name = "security-review";

  shouldSkip(context: GateContext, previousResults: readonly GateResult[]): boolean {
    if (context.runSecurityReview === false) return true;
    return previousResults.some((r) => r.gateName === "static-analysis" && !r.passed);
  }

  async evaluate(context: GateContext): Promise<GateResult> {
    const span = tracer.startSpan("agent_core.security_review_gate");
    try {
      const reviewResult = await reviewDiff(context.diff);

      span.setAttribute("security_review.approved", reviewResult.approved);
      span.setAttribute("security_review.issues_count", reviewResult.issues.length);

      if (!reviewResult.approved) {
        return {
          passed: false,
          gateName: this.name,
          severity: "error",
          details: `Security review failed: ${reviewResult.issues.join("; ")}`,
        };
      }

      return { passed: true, gateName: this.name, severity: "error" };
    } finally {
      span.end();
    }
  }
}
