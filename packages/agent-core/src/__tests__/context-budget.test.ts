import { describe, it, expect } from "vitest";
import { createContextBudget, MODEL_CONTEXT_LIMITS } from "../context-budget.js";

// ── Helpers ────────────────────────────────────────────────────────

function makeTurnData(inputTokens: number, outputTokens: number) {
  return { inputTokens, outputTokens };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("ContextBudget", () => {
  describe("MODEL_CONTEXT_LIMITS", () => {
    it("has entries for known model patterns", () => {
      expect(MODEL_CONTEXT_LIMITS["claude-sonnet-4-6"]).toBe(200_000);
      expect(MODEL_CONTEXT_LIMITS["claude-opus-4-8"]).toBe(1_000_000);
      expect(MODEL_CONTEXT_LIMITS["claude-haiku-4-5-20251001"]).toBe(200_000);
    });
  });

  describe("createContextBudget", () => {
    it("returns a ContextBudget with initial zero usage", () => {
      const budget = createContextBudget("claude-sonnet-4-6");
      const usage = budget.usage();
      expect(usage.used).toBe(0);
      expect(usage.limit).toBe(200_000);
      expect(usage.remaining).toBe(200_000);
      expect(usage.percentUsed).toBe(0);
    });

    it("uses fallback limit for unknown models", () => {
      const budget = createContextBudget("unknown-model-xyz");
      expect(budget.usage().limit).toBe(200_000);
    });
  });

  describe("track()", () => {
    it("accumulates token usage across turns", () => {
      const budget = createContextBudget("claude-sonnet-4-6");
      budget.track(makeTurnData(10_000, 5_000));
      budget.track(makeTurnData(20_000, 3_000));

      const usage = budget.usage();
      // Uses the latest inputTokens as the running context size
      // (input tokens reflect the full conversation so far)
      expect(usage.used).toBe(20_000);
    });

    it("calculates percentUsed correctly", () => {
      const budget = createContextBudget("claude-sonnet-4-6"); // 200k limit
      budget.track(makeTurnData(100_000, 5_000));

      const usage = budget.usage();
      expect(usage.percentUsed).toBe(50);
      expect(usage.remaining).toBe(100_000);
    });
  });

  describe("trackCompaction()", () => {
    it("increments compaction count", () => {
      const budget = createContextBudget("claude-sonnet-4-6");
      budget.trackCompaction();
      budget.trackCompaction();
      expect(budget.compactionCount()).toBe(2);
    });
  });

  describe("shouldCompact()", () => {
    it("returns false below 85% usage", () => {
      const budget = createContextBudget("claude-sonnet-4-6");
      budget.track(makeTurnData(160_000, 5_000)); // 80%
      expect(budget.shouldCompact()).toBe(false);
    });

    it("returns true at 85%+ usage", () => {
      const budget = createContextBudget("claude-sonnet-4-6");
      budget.track(makeTurnData(170_000, 5_000)); // 85%
      expect(budget.shouldCompact()).toBe(true);
    });
  });

  describe("strategyHint()", () => {
    it("returns null below 50%", () => {
      const budget = createContextBudget("claude-sonnet-4-6");
      budget.track(makeTurnData(90_000, 5_000)); // 45%
      expect(budget.strategyHint()).toBeNull();
    });

    it("returns 'targeted_reads' at 50%", () => {
      const budget = createContextBudget("claude-sonnet-4-6");
      budget.track(makeTurnData(100_000, 5_000)); // 50%
      const hint = budget.strategyHint();
      expect(hint).not.toBeNull();
      expect(hint!.strategy).toBe("targeted_reads");
      expect(hint!.percentUsed).toBe(50);
    });

    it("returns 'wrap_up' at 70%", () => {
      const budget = createContextBudget("claude-sonnet-4-6");
      budget.track(makeTurnData(140_000, 5_000)); // 70%
      const hint = budget.strategyHint();
      expect(hint!.strategy).toBe("wrap_up");
    });

    it("returns 'checkpoint' at 85%", () => {
      const budget = createContextBudget("claude-sonnet-4-6");
      budget.track(makeTurnData(170_000, 5_000)); // 85%
      const hint = budget.strategyHint();
      expect(hint!.strategy).toBe("checkpoint");
    });

    it("returns 'graceful_exit' at 95%", () => {
      const budget = createContextBudget("claude-sonnet-4-6");
      budget.track(makeTurnData(190_000, 5_000)); // 95%
      const hint = budget.strategyHint();
      expect(hint!.strategy).toBe("graceful_exit");
    });

    it("returns highest applicable strategy (not lower ones)", () => {
      const budget = createContextBudget("claude-sonnet-4-6");
      budget.track(makeTurnData(190_000, 5_000)); // 95%
      const hint = budget.strategyHint();
      // Should return graceful_exit, not targeted_reads or wrap_up
      expect(hint!.strategy).toBe("graceful_exit");
    });
  });

  describe("strategyMessage()", () => {
    it("returns null below 50%", () => {
      const budget = createContextBudget("claude-sonnet-4-6");
      budget.track(makeTurnData(90_000, 5_000));
      expect(budget.strategyMessage()).toBeNull();
    });

    it("returns a human-readable message at 70%", () => {
      const budget = createContextBudget("claude-sonnet-4-6");
      budget.track(makeTurnData(140_000, 5_000));
      const msg = budget.strategyMessage();
      expect(msg).toContain("70%");
      expect(msg).toContain("wrap up");
    });
  });

  describe("peakPercent()", () => {
    it("tracks the highest percentage seen", () => {
      const budget = createContextBudget("claude-sonnet-4-6");
      budget.track(makeTurnData(150_000, 5_000)); // 75%
      budget.track(makeTurnData(100_000, 5_000)); // 50% (after compaction, context shrinks)
      expect(budget.peakPercent()).toBe(75);
    });
  });

  describe("truncateToolOutput()", () => {
    it("returns short output unchanged", () => {
      const budget = createContextBudget("claude-sonnet-4-6");
      const short = "hello world";
      expect(budget.truncateToolOutput(short)).toBe(short);
    });

    it("truncates output exceeding default max", () => {
      const budget = createContextBudget("claude-sonnet-4-6");
      // Default max is ~5000 tokens. At ~4 chars/token, that's ~20k chars.
      const long = "x".repeat(25_000);
      const result = budget.truncateToolOutput(long);
      expect(result.length).toBeLessThan(long.length);
      expect(result).toContain("...truncated");
    });

    it("respects custom maxChars", () => {
      const budget = createContextBudget("claude-sonnet-4-6", { maxToolOutputChars: 100 });
      const long = "x".repeat(200);
      const result = budget.truncateToolOutput(long);
      expect(result.length).toBeLessThanOrEqual(200); // includes the truncation message
      expect(result).toContain("...truncated");
    });
  });

  describe("metrics()", () => {
    it("returns context metrics for Langfuse", () => {
      const budget = createContextBudget("claude-sonnet-4-6");
      budget.track(makeTurnData(150_000, 5_000));
      budget.trackCompaction();

      const metrics = budget.metrics();
      expect(metrics.contextPercentAtExit).toBe(75);
      expect(metrics.peakContextPercent).toBe(75);
      expect(metrics.contextLimit).toBe(200_000);
      expect(metrics.compactionCount).toBe(1);
    });
  });

  describe("opus model with 1M context", () => {
    it("thresholds scale with larger context window", () => {
      const budget = createContextBudget("claude-opus-4-8");
      budget.track(makeTurnData(500_000, 5_000)); // 50% of 1M
      const hint = budget.strategyHint();
      expect(hint).not.toBeNull();
      expect(hint!.strategy).toBe("targeted_reads");
    });
  });
});
