import { describe, it, expect, vi } from "vitest";
import type { GateContext, GateResult, QualityGate } from "../gate-runner.js";
import { GateRunner } from "../gate-runner.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeContext(overrides: Partial<GateContext> = {}): GateContext {
  return {
    diff: "diff --git a/src/foo.ts b/src/foo.ts\n+const x = 1;",
    taskDescription: "Fix the bug",
    commitMsg: "fix: the bug",
    evaluateSuccess: true,
    runStaticAnalysis: true,
    runSecurityReview: true,
    ...overrides,
  };
}

function passingGate(name: string): QualityGate {
  return {
    name,
    evaluate: vi.fn(
      async (): Promise<GateResult> => ({
        passed: true,
        gateName: name,
        severity: "error",
      })
    ),
  };
}

function failingGate(name: string, details = "something went wrong"): QualityGate {
  return {
    name,
    evaluate: vi.fn(
      async (): Promise<GateResult> => ({
        passed: false,
        gateName: name,
        severity: "error",
        details,
      })
    ),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("GateRunner", () => {
  describe("basic execution", () => {
    it("returns passed=true when gate list is empty", async () => {
      const runner = new GateRunner([]);
      const result = await runner.run(makeContext());
      expect(result.passed).toBe(true);
      expect(result.results).toHaveLength(0);
    });

    it("runs gates in order and collects results", async () => {
      const order: string[] = [];
      const gates: QualityGate[] = [
        {
          name: "gate-a",
          evaluate: vi.fn(async () => {
            order.push("a");
            return { passed: true, gateName: "gate-a", severity: "error" as const };
          }),
        },
        {
          name: "gate-b",
          evaluate: vi.fn(async () => {
            order.push("b");
            return { passed: true, gateName: "gate-b", severity: "error" as const };
          }),
        },
        {
          name: "gate-c",
          evaluate: vi.fn(async () => {
            order.push("c");
            return { passed: true, gateName: "gate-c", severity: "error" as const };
          }),
        },
      ];

      const runner = new GateRunner(gates);
      await runner.run(makeContext());
      expect(order).toEqual(["a", "b", "c"]);
    });

    it("returns all gate results in the results array", async () => {
      const runner = new GateRunner([passingGate("alpha"), passingGate("beta")]);
      const result = await runner.run(makeContext());
      expect(result.results).toHaveLength(2);
      expect(result.results[0].gateName).toBe("alpha");
      expect(result.results[1].gateName).toBe("beta");
    });

    it("passes context to each gate", async () => {
      const ctx = makeContext({ taskDescription: "special task" });
      const gate = passingGate("ctx-gate");
      const runner = new GateRunner([gate]);
      await runner.run(ctx);
      expect(gate.evaluate).toHaveBeenCalledWith(ctx);
    });
  });

  describe("pass/fail determination", () => {
    it("returns passed=true when all gates pass", async () => {
      const runner = new GateRunner([passingGate("a"), passingGate("b")]);
      const result = await runner.run(makeContext());
      expect(result.passed).toBe(true);
    });

    it("returns passed=false when any gate fails", async () => {
      const runner = new GateRunner([passingGate("a"), failingGate("b"), passingGate("c")]);
      const result = await runner.run(makeContext());
      expect(result.passed).toBe(false);
    });

    it("includes details from failing gates in the result", async () => {
      const runner = new GateRunner([failingGate("broken", "specific error detail")]);
      const result = await runner.run(makeContext());
      expect(result.results[0].details).toBe("specific error detail");
    });

    it("continues running gates after a failure", async () => {
      const last = passingGate("last");
      const runner = new GateRunner([failingGate("first"), last]);
      await runner.run(makeContext());
      expect(last.evaluate).toHaveBeenCalled();
    });
  });

  describe("shouldSkip", () => {
    it("skips gate when shouldSkip returns true", async () => {
      const gate: QualityGate = {
        name: "skip-me",
        evaluate: vi.fn(async () => ({
          passed: false,
          gateName: "skip-me",
          severity: "error" as const,
        })),
        shouldSkip: vi.fn(() => true),
      };

      const runner = new GateRunner([gate]);
      const result = await runner.run(makeContext());

      expect(gate.evaluate).not.toHaveBeenCalled();
      expect(result.results[0].passed).toBe(true);
      expect(result.results[0].details).toBe("skipped");
    });

    it("does not skip gate when shouldSkip returns false", async () => {
      const gate: QualityGate = {
        name: "run-me",
        evaluate: vi.fn(async () => ({
          passed: true,
          gateName: "run-me",
          severity: "error" as const,
        })),
        shouldSkip: vi.fn(() => false),
      };

      const runner = new GateRunner([gate]);
      await runner.run(makeContext());

      expect(gate.evaluate).toHaveBeenCalled();
    });

    it("skipped gates do not cause overall failure", async () => {
      const gate: QualityGate = {
        name: "skip-me",
        evaluate: vi.fn(async () => ({
          passed: false,
          gateName: "skip-me",
          severity: "error" as const,
        })),
        shouldSkip: vi.fn(() => true),
      };

      const runner = new GateRunner([gate]);
      const result = await runner.run(makeContext());
      expect(result.passed).toBe(true);
    });

    it("passes context to shouldSkip", async () => {
      const ctx = makeContext({ evaluateSuccess: false });
      const gate: QualityGate = {
        name: "ctx-skip",
        evaluate: vi.fn(async () => ({
          passed: true,
          gateName: "ctx-skip",
          severity: "error" as const,
        })),
        shouldSkip: vi.fn(() => false),
      };

      const runner = new GateRunner([gate]);
      await runner.run(ctx);
      expect(gate.shouldSkip).toHaveBeenCalledWith(ctx);
    });

    it("gates without shouldSkip always run", async () => {
      const gate = passingGate("always-runs");
      const runner = new GateRunner([gate]);
      await runner.run(makeContext());
      expect(gate.evaluate).toHaveBeenCalled();
    });

    it("mixed skipped and non-skipped gates only fail on non-skipped failures", async () => {
      const skipped: QualityGate = {
        name: "skipped",
        evaluate: vi.fn(async () => ({
          passed: false,
          gateName: "skipped",
          severity: "error" as const,
        })),
        shouldSkip: () => true,
      };
      const passed = passingGate("passed");

      const runner = new GateRunner([skipped, passed]);
      const result = await runner.run(makeContext());
      expect(result.passed).toBe(true);
    });
  });
});
