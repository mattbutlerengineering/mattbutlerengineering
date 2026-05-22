import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createLintViolationBug,
  createDeadLinkBug,
  createA11yBug,
} from "../synthetic-bug-seeder.js";

describe("synthetic-bug-seeder", () => {
  const mockRepoPath = "/mock/repo";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createLintViolationBug", () => {
    it("creates lint violation bug config", () => {
      const config = createLintViolationBug(mockRepoPath);

      expect(config.type).toBe("lint-violation");
      expect(config.repoPath).toBe(mockRepoPath);
      expect(config.filePath).toBe("apps/marketing/src/utils/chaos-test-lint.ts");
      expect(config.fileContent).toContain("unusedVariable");
      expect(config.fileContent).toContain("no-unused-vars");
      expect(config.commitMessage).toContain("lint violation");
      expect(config.branchName).toMatch(/^chaos\/lint-violation-\d+$/);
    });

    it("includes unused variable that triggers eslint", () => {
      const config = createLintViolationBug(mockRepoPath);
      expect(config.fileContent).toContain("const unusedVariable");
    });
  });

  describe("createDeadLinkBug", () => {
    it("creates dead link bug config", () => {
      const config = createDeadLinkBug(mockRepoPath);

      expect(config.type).toBe("dead-link");
      expect(config.repoPath).toBe(mockRepoPath);
      expect(config.filePath).toBe("apps/marketing/src/pages/chaos-test.mdx");
      expect(config.fileContent).toContain("dead link");
      expect(config.fileContent).toContain("nonexistent-page");
      expect(config.commitMessage).toContain("dead link");
      expect(config.branchName).toMatch(/^chaos\/dead-link-\d+$/);
    });

    it("includes markdown link to non-existent page", () => {
      const config = createDeadLinkBug(mockRepoPath);
      expect(config.fileContent).toMatch(
        /\[.*\]\(https:\/\/mattbutlerengineering\.com\/chaos\/nonexistent-page-\d+\)/
      );
    });
  });

  describe("createA11yBug", () => {
    it("creates a11y bug config", () => {
      const config = createA11yBug(mockRepoPath);

      expect(config.type).toBe("a11y-issue");
      expect(config.repoPath).toBe(mockRepoPath);
      expect(config.filePath).toBe("apps/rialto-web/src/pages/chaos-test.tsx");
      expect(config.fileContent).toContain("missing alt text");
      expect(config.fileContent).toContain("<img");
      expect(config.commitMessage).toContain("a11y");
      expect(config.branchName).toMatch(/^chaos\/a11y-issue-\d+$/);
    });

    it("includes image without alt attribute", () => {
      const config = createA11yBug(mockRepoPath);
      expect(config.fileContent).toMatch(/<img src="\/test-image\.png" \/>/);
    });

    it("includes jsx-a11y eslint disable comment", () => {
      const config = createA11yBug(mockRepoPath);
      expect(config.fileContent).toContain("jsx-a11y/alt-text");
    });
  });

  describe("branch naming", () => {
    it("generates unique branch names with timestamps", async () => {
      const config1 = createLintViolationBug(mockRepoPath);
      // Add small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 5));
      const config2 = createLintViolationBug(mockRepoPath);

      expect(config1.branchName).not.toBe(config2.branchName);
    });

    it("uses chaos prefix for all bug types", () => {
      const lintConfig = createLintViolationBug(mockRepoPath);
      const linkConfig = createDeadLinkBug(mockRepoPath);
      const a11yConfig = createA11yBug(mockRepoPath);

      expect(lintConfig.branchName.startsWith("chaos/")).toBe(true);
      expect(linkConfig.branchName.startsWith("chaos/")).toBe(true);
      expect(a11yConfig.branchName.startsWith("chaos/")).toBe(true);
    });
  });
});
