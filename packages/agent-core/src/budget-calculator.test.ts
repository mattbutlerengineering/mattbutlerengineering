import { describe, it, expect } from "vitest";
import {
  resolveBudget,
  resolveModel,
  formatPrExamples,
  fetchRecentPrExamples,
} from "./budget-calculator.js";
import { execFile } from "node:child_process";

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

describe("budget-calculator", () => {
  describe("resolveBudget", () => {
    it("returns simple budget for lint tasks", () => {
      const budget = resolveBudget("fix lint errors");
      expect(budget.budgetUsd).toBe(0.5);
      expect(budget.reason).toBe("simple fix");
    });

    it("returns complex budget for feat tasks", () => {
      const budget = resolveBudget("implement new feature");
      expect(budget.budgetUsd).toBe(2.0);
      expect(budget.reason).toBe("complex feature");
    });

    it("defaults to standard budget", () => {
      const budget = resolveBudget("random task");
      expect(budget.budgetUsd).toBe(1.0);
      expect(budget.reason).toBe("standard task");
    });

    it("returns simple budget for bump tasks", () => {
      const budget = resolveBudget("bump lodash version");
      expect(budget.budgetUsd).toBe(0.5);
      expect(budget.maxTurns).toBe(30);
    });

    it("returns complex budget for architecture tasks", () => {
      const budget = resolveBudget("architect the new microservice");
      expect(budget.budgetUsd).toBe(2.0);
      expect(budget.maxTurns).toBe(75);
    });

    it("complex wins over simple when both keywords present", () => {
      // "feat" (complex) + "rename" (simple) — complex checked first
      const budget = resolveBudget("feat: rename old file to new system");
      expect(budget.budgetUsd).toBe(2.0);
    });
  });

  describe("resolveModel", () => {
    it("returns haiku for simple tasks", () => {
      expect(resolveModel("fix typo")).toBe("claude-haiku-4-5-20251001");
    });

    it("returns sonnet for complex tasks", () => {
      expect(resolveModel("architect new system")).toBe("claude-sonnet-4-6");
    });

    it("returns sonnet for standard tasks", () => {
      expect(resolveModel("update logic")).toBe("claude-sonnet-4-6");
    });

    it("returns haiku for bump tasks", () => {
      expect(resolveModel("bump dependencies")).toBe("claude-haiku-4-5-20251001");
    });
  });

  describe("formatPrExamples", () => {
    it("returns empty string for empty examples", () => {
      expect(formatPrExamples([])).toBe("");
    });

    it("formats examples correctly", () => {
      const examples = [{ title: "T1", body: "B1", filesChanged: 2 }];
      const formatted = formatPrExamples(examples);
      expect(formatted).toContain("### Example 1: T1");
      expect(formatted).toContain("Files changed: 2");
      expect(formatted).toContain("B1");
    });

    it("formats multiple examples", () => {
      const examples = [
        { title: "T1", body: "B1", filesChanged: 2 },
        { title: "T2", body: "B2", filesChanged: 5 },
      ];
      const formatted = formatPrExamples(examples);
      expect(formatted).toContain("### Example 1: T1");
      expect(formatted).toContain("### Example 2: T2");
    });
  });

  describe("fetchRecentPrExamples", () => {
    it("returns examples on success", async () => {
      const mockPr = { title: "P1", body: "B1", filesChanged: 1 };
      vi.mocked(execFile).mockImplementation((cmd, args, options, callback) => {
        (callback as any)(null, { stdout: JSON.stringify(mockPr) });
        return {} as any;
      });

      const examples = await fetchRecentPrExamples("/path");
      expect(examples[0]).toEqual(mockPr);
    });

    it("returns empty array on failure", async () => {
      vi.mocked(execFile).mockImplementation((cmd, args, options, callback) => {
        (callback as any)(new Error("fail"));
        return {} as any;
      });

      const examples = await fetchRecentPrExamples("/path");
      expect(examples).toEqual([]);
    });
  });
});
