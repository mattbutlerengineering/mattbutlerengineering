import { describe, it, expect, vi } from "vitest";
import { resolveSourceFiles, classifyTaskContexts } from "./source-resolver.js";
import { existsSync } from "node:fs";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

describe("source-resolver", () => {
  describe("classifyTaskContexts", () => {
    it("returns security bundle path for security keyword", () => {
      const paths = classifyTaskContexts("Fix security vulnerability in auth");
      expect(paths).toContain(".agent/contexts/security-audit.md");
    });

    it("returns testing bundle path for test keyword", () => {
      const paths = classifyTaskContexts("Add vitest mocks for the new module");
      expect(paths).toContain(".agent/contexts/testing-patterns.md");
    });

    it("returns dependency bundle path for bump keyword", () => {
      const paths = classifyTaskContexts("bump dependency versions");
      expect(paths).toContain(".agent/contexts/dependency-bump.md");
    });

    it("returns deploy bundle path for deploy keyword", () => {
      const paths = classifyTaskContexts("fix the deploy pipeline");
      expect(paths).toContain(".agent/contexts/deploy-fixes.md");
    });

    it("returns type-safety bundle path for typescript keyword", () => {
      const paths = classifyTaskContexts("Fix typescript any types");
      expect(paths).toContain(".agent/contexts/type-safety.md");
    });

    it("returns empty array for unmatched description", () => {
      const paths = classifyTaskContexts("Improve layout of the homepage");
      expect(paths).toEqual([]);
    });

    it("returns multiple bundles when description matches multiple categories", () => {
      const paths = classifyTaskContexts("security audit of test coverage");
      expect(paths).toContain(".agent/contexts/security-audit.md");
      expect(paths).toContain(".agent/contexts/testing-patterns.md");
    });

    it("returns unique paths (no duplicates)", () => {
      // 'audit' and 'security' both map to security-audit.md
      const paths = classifyTaskContexts("security audit");
      const securityPaths = paths.filter((p) => p === ".agent/contexts/security-audit.md");
      expect(securityPaths.length).toBe(1);
    });
  });

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

    it("does not add test file for already-test files", () => {
      const files = resolveSourceFiles("Change apps/gen/src/main.test.ts");
      const testFiles = files.filter((f) => f.endsWith(".test.ts"));
      // main.test.ts should appear once, not doubled
      expect(testFiles.filter((f) => f === "apps/gen/src/main.test.ts").length).toBe(1);
    });

    it("returns unique files", () => {
      const files = resolveSourceFiles(
        "Change apps/gen/src/main.ts and apps/gen/src/main.ts again"
      );
      const count = files.filter((f) => f === "apps/gen/src/main.ts").length;
      expect(count).toBe(1);
    });

    it("adds CLAUDE.md for app directories", () => {
      const files = resolveSourceFiles("Fix apps/hospitality/ layout");
      expect(files).toContain("apps/hospitality/CLAUDE.md");
    });

    it("does not add CLAUDE.md for package directories", () => {
      const files = resolveSourceFiles("Update packages/types/ types");
      expect(files).not.toContain("packages/types/CLAUDE.md");
    });

    it("returns empty array for descriptions with no file references", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const files = resolveSourceFiles("Fix a general issue");
      expect(files).toEqual([]);
    });
  });
});
