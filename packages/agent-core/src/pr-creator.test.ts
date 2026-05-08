/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPullRequest, buildPrTitle, buildPrBody, buildFailurePrBody } from "./pr-creator.js";
import { execFile } from "node:child_process";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

describe("pr-creator", () => {
  describe("buildPrTitle", () => {
    it("builds a short title", () => {
      expect(buildPrTitle("fix the bug")).toBe("feat: fix the bug");
    });

    it("truncates a long title", () => {
      const long = "a".repeat(100);
      const title = buildPrTitle(long);
      expect(title.length).toBeLessThan(70);
      expect(title).toContain("...");
    });
  });

  describe("buildPrBody", () => {
    it("builds a standard PR body", () => {
      const body = buildPrBody("task", "sess-1", 0.05, 10);
      expect(body).toContain("## Summary");
      expect(body).toContain("sess-1");
      expect(body).toContain("$0.0500");
      expect(body).toContain("10");
    });
  });

  describe("buildFailurePrBody", () => {
    it("builds a failure PR body", () => {
      const body = buildFailurePrBody("task", ["err1"], "loop");
      expect(body).toContain("failed agent session");
      expect(body).toContain("err1");
      expect(body).toContain("loop");
    });

    it("handles no stuck pattern", () => {
      const body = buildFailurePrBody("task", ["err1"]);
      expect(body).not.toContain("Stuck pattern");
    });
  });

  describe("createPullRequest", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("calls gh pr create with correct args", async () => {
      const mockResult = {
        url: "https://github.com/org/repo/pull/123",
        number: 123,
      };

      vi.mocked(execFile).mockImplementation((cmd, args, options, callback) => {
        (callback as any)(null, { stdout: JSON.stringify(mockResult) });
        return {} as any;
      });

      const result = await createPullRequest({
        title: "title",
        body: "body",
        baseBranch: "main",
        branchName: "feat/branch",
        repoPath: "/path",
        draft: true,
      });

      expect(result).toEqual(mockResult);
      expect(execFile).toHaveBeenCalledWith(
        "gh",
        expect.arrayContaining(["pr", "create", "--draft"]),
        expect.objectContaining({ cwd: "/path" }),
        expect.any(Function)
      );
    });
  });
});
