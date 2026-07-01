import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: vi.fn((fn: unknown) => fn),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { execFile } from "node:child_process";
import {
  createLintViolationBug,
  createDeadLinkBug,
  createA11yBug,
  seedSyntheticBug,
  cleanupSyntheticBugBranch,
} from "../synthetic-bug-seeder.js";

const mockExecFile = vi.mocked(
  execFile as unknown as (...args: unknown[]) => Promise<{ stdout: string }>
);

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

  describe("git subprocess timeout", () => {
    it("passes a numeric timeout on every git call in seedSyntheticBug", async () => {
      mockExecFile.mockResolvedValue({ stdout: "[main abc1234] test commit" });

      await seedSyntheticBug(createLintViolationBug(mockRepoPath));

      expect(mockExecFile.mock.calls.length).toBeGreaterThan(0);
      for (const call of mockExecFile.mock.calls) {
        const options = call[2] as { timeout?: number } | undefined;
        expect(typeof options?.timeout).toBe("number");
        expect(options?.timeout).toBeGreaterThan(0);
      }
    });

    it("passes a numeric timeout on every git call in cleanupSyntheticBugBranch", async () => {
      mockExecFile.mockResolvedValue({ stdout: "" });

      await cleanupSyntheticBugBranch(mockRepoPath, "chaos/lint-violation-123");

      expect(mockExecFile.mock.calls.length).toBeGreaterThan(0);
      for (const call of mockExecFile.mock.calls) {
        const options = call[2] as { timeout?: number } | undefined;
        expect(typeof options?.timeout).toBe("number");
        expect(options?.timeout).toBeGreaterThan(0);
      }
    });
  });
});
