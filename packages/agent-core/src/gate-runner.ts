import type { SessionEventCallback } from "./types.js";
import type { EvaluationResult } from "./success-evaluator.js";
import type { ReviewResult } from "./diff-reviewer.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface GateContext {
  taskDescription: string;
  diff: string;
  commitMsg: string;
  evaluateSuccess?: boolean;
  runSecurityReview?: boolean;
  runStaticAnalysis?: boolean;
}

export interface GateResult {
  staticAnalysisClean: boolean;
  errors: string[];
  evaluation?: EvaluationResult;
  securityReview?: ReviewResult;
}

export interface QualityGate {
  run(ctx: GateContext, onEvent?: SessionEventCallback): Promise<void>;
  getResult(): Partial<GateResult>;
}

// ── GateRunner ────────────────────────────────────────────────────────────────

/**
 * Orchestrates a sequence of QualityGate instances.
 * Runs each gate in order and aggregates results into a single GateResult.
 */
export class GateRunner {
  constructor(private readonly gates: QualityGate[]) {}

  async run(ctx: GateContext, onEvent?: SessionEventCallback): Promise<GateResult> {
    const result: GateResult = {
      staticAnalysisClean: true,
      errors: [],
    };

    for (const gate of this.gates) {
      await gate.run(ctx, onEvent);
      const partial = gate.getResult();

      if (partial.errors) result.errors.push(...partial.errors);
      if (partial.evaluation !== undefined) result.evaluation = partial.evaluation;
      if (partial.securityReview !== undefined) result.securityReview = partial.securityReview;
      if (partial.staticAnalysisClean === false) result.staticAnalysisClean = false;
    }

    return result;
  }
}
