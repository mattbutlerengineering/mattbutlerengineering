import { trace } from "@opentelemetry/api";
import { reviewDiff } from "../diff-reviewer.js";
import { emitEvent } from "../utils.js";
import type { SessionEventCallback } from "../types.js";
import type { GateContext, GateResult, QualityGate } from "../gate-runner.js";

const tracer = trace.getTracer("@mbe/agent-core");

/**
 * AI security review gate. Scans diff for secrets, XSS, SQLi, a11y issues.
 * Skipped when runSecurityReview=false or when staticAnalysisClean=false.
 */
export class SecurityReviewGate implements QualityGate {
  private result: Partial<GateResult> = {};

  async run(ctx: GateContext, onEvent?: SessionEventCallback): Promise<void> {
    if (ctx.runSecurityReview === false) {
      return;
    }

    const errors: string[] = [];
    const reviewSpan = tracer.startSpan("agent_core.security_review");
    try {
      const securityReview = await reviewDiff(ctx.diff);
      reviewSpan.setAttribute("review.approved", securityReview.approved);
      reviewSpan.setAttribute("review.issues_count", securityReview.issues.length);

      emitEvent(onEvent, "session:review", {
        message: securityReview.approved
          ? "Security review: APPROVED"
          : `Security review: BLOCKED — ${securityReview.issues.join("; ")}`,
      });

      if (!securityReview.approved) {
        errors.push(`Security review failed: ${securityReview.issues.join("; ")}`);
      }

      this.result = { securityReview, errors };
    } finally {
      reviewSpan.end();
    }
  }

  getResult(): Partial<GateResult> {
    return this.result;
  }
}
