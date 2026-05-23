import { describe, it, expect, vi } from "vitest";
import { resolveSourceFiles } from "./source-resolver.js";
import { existsSync } from "node:fs";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

describe("source-resolver", () => {
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
