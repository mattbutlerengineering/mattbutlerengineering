// ── Types ─────────────────────────────────────────────────────────────

/**
 * Shared context passed to every quality gate during a run.
 */
export interface GateContext {
  /** The git diff produced by the agent's commit. */
  readonly diff: string;
  /** The original task description used to drive the agent session. */
  readonly taskDescription: string;
  /** The commit message written when the agent committed changes. */
  readonly commitMsg: string;
  /** Whether LLM success evaluation is enabled in the session config. */
  readonly evaluateSuccess: boolean;
  /** Whether static diff analysis is enabled in the session config. */
  readonly runStaticAnalysis: boolean;
  /** Whether AI security review is enabled in the session config. */
  readonly runSecurityReview: boolean;
}

/**
 * Result produced by a single quality gate.
 */
export interface GateResult {
  /** Whether this gate passed. Skipped gates always report passed=true. */
  readonly passed: boolean;
  /** The name of the gate that produced this result. */
  readonly gateName: string;
  /** Severity level of this gate — drives draft-PR vs normal-PR decision. */
  readonly severity: "error" | "warning";
  /** Human-readable details about a failure or a skip reason. */
  readonly details?: string;
}

/**
 * Aggregate result returned by GateRunner.run().
 */
export interface GateRunResult {
  /** True when every non-skipped gate passed. */
  readonly passed: boolean;
  /** Individual results for each gate, in run order. */
  readonly results: readonly GateResult[];
}

/**
 * A quality gate that can evaluate a diff context and report pass/fail.
 *
 * Implement this interface to register new gates with GateRunner.
 */
export interface QualityGate {
  /** Stable identifier shown in draft-PR failure messages. */
  readonly name: string;

  /**
   * Evaluate the diff context and return a result.
   * Called only when shouldSkip() is absent or returns false.
   */
  evaluate(context: GateContext): Promise<GateResult>;

  /**
   * Optional predicate — return true to bypass evaluate() for this run.
   * Skipped gates contribute a passed=true result with details="skipped".
   */
  shouldSkip?(context: GateContext): boolean;
}

// ── GateRunner ────────────────────────────────────────────────────────

/**
 * Runs an ordered list of QualityGate instances against a GateContext.
 *
 * Gates run sequentially (never in parallel) so that earlier gates can
 * implicitly gate later ones via shouldSkip(). All gates run even when
 * a prior gate fails, so the caller receives the full failure picture.
 */
export class GateRunner {
  constructor(private readonly gates: readonly QualityGate[]) {}

  async run(context: GateContext): Promise<GateRunResult> {
    const results: GateResult[] = [];

    for (const gate of this.gates) {
      if (gate.shouldSkip?.(context)) {
        results.push({
          passed: true,
          gateName: gate.name,
          severity: "warning",
          details: "skipped",
        });
        continue;
      }

      results.push(await gate.evaluate(context));
    }

    return {
      passed: results.every((r) => r.passed),
      results,
    };
  }
}
