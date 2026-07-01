import { describe, it, expect } from "vitest";
import type { GateContext } from "../gate-runner.js";
import { StaticAnalysisGate } from "./static-analysis-gate.js";

/**
 * Proves a QualityGate is unit-testable against a raw diff fixture in
 * complete isolation — no GateRunner, no post-commit-gateway, no worktree,
 * no session pipeline, and (unlike the other gate tests) no `vi.mock` at
 * all. `StaticAnalysisGate` wraps the pure `analyzeDiff()` regex scanner,
 * so evaluating it end-to-end here is a true unit test of the interface
 * itself: `evaluate(context) -> GateResult`.
 */
function makeContext(diff: string): GateContext {
  return {
    diff,
    taskDescription: "Fix the bug",
    commitMsg: "fix: the bug",
    evaluateSuccess: true,
    runStaticAnalysis: true,
    runSecurityReview: true,
  };
}

describe("StaticAnalysisGate (isolated diff-fixture test)", () => {
  it("fails on a diff fixture containing an error-severity violation", async () => {
    const diff = [
      "diff --git a/src/widget.ts b/src/widget.ts",
      "+++ b/src/widget.ts",
      "+console.log('debug');",
    ].join("\n");

    const gate = new StaticAnalysisGate();
    const result = await gate.evaluate(makeContext(diff));

    expect(result.gateName).toBe("static-analysis");
    expect(result.passed).toBe(false);
    expect(result.details).toContain("no-console-log");
  });

  it("passes on a clean diff fixture with no violations", async () => {
    const diff = [
      "diff --git a/src/widget.ts b/src/widget.ts",
      "+++ b/src/widget.ts",
      "+export const widgetLabel = 'hello';",
    ].join("\n");

    const gate = new StaticAnalysisGate();
    const result = await gate.evaluate(makeContext(diff));

    expect(result.passed).toBe(true);
  });
});
