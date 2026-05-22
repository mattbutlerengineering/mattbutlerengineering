/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import {
  resolveSourceFiles,
  resolveBudget,
  resolveModel,
  formatPrExamples,
  fetchRecentPrExamples,
} from "./task-intelligence.js";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

describe("task-intelligence", () => {
  describe("resolveSourceFiles", () => {
    it("extracts explicit file paths", () => {
      const files = resolveSourceFiles("Change apps/gen/src/main.ts");
      expect(files).toContain("apps/gen/src/main.ts");
      expect(files).toContain("apps/gen/src/main.test.ts");
    });

    it("handles directory references", () => {
      const files = resolveSourceFiles("Update services/users/ and packages/types/");
      expect(files).toContain("services/users/CLAUDE.md");
    });

    it("detects task contexts based on keywords", () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const files = resolveSourceFiles("Fix security vulnerability in auth");
      expect(files).toContain(".agent/contexts/security-audit.md");
    });
  });

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
