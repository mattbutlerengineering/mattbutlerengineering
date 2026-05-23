import { trace } from "@opentelemetry/api";
import { reviewDiff } from "../diff-reviewer.js";
import type { GateContext, GateResult, QualityGate } from "../gate-runner.js";

const tracer = trace.getTracer("@mbe/agent-core");

/**
 * Wraps the AI security reviewer as a QualityGate.
 *
 * shouldSkip: returns true when runSecurityReview=false in the context.
 * Note: the previous quality-gates.ts also skipped security review when
 * static analysis had errors (checked via result.staticAnalysisClean).
 * That coupling is now expressed via gate ordering — callers should place
 * StaticAnalysisGate before SecurityReviewGate and use shouldSkip to
 * implement cross-gate dependencies if needed. The default behavior here
 * mirrors the pre-refactor behavior by relying on GateRunner running gates
 * in order; post-commit-gateway.ts recreates the skip via the existing
 * runQualityGates wrapper until it migrates to GateRunner directly.
 */
export class SecurityReviewGate implements QualityGate {
  readonly name = "security-review";

  shouldSkip(context: GateContext): boolean {
    return context.runSecurityReview === false;
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
