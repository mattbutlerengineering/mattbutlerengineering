import { describe, it, expect, vi } from "vitest";
import { gitWorkflowStatus } from "./git.js";

const BRANCH_OUTPUT = "main";
const CLEAN_STATUS = "";
const DIRTY_STATUS = "M src/index.ts\nA src/new.ts";
const COMMITS_OUTPUT = "abc1234 Fix something\ndef5678 Add feature";
const CI_OUTPUT = JSON.stringify([{ conclusion: "success" }]);
const CI_ERROR_ENVELOPE = JSON.stringify({
  error: "Command failed",
  message: "gh: command not found",
});

describe("gitWorkflowStatus", () => {
  it("returns full git status with CI info", async () => {
    const run = vi
      .fn()
      .mockReturnValueOnce(BRANCH_OUTPUT)
      .mockReturnValueOnce(CLEAN_STATUS)
      .mockReturnValueOnce(COMMITS_OUTPUT)
      .mockReturnValueOnce(CI_OUTPUT);

    const result = await gitWorkflowStatus(run);
    const parsed = JSON.parse(result) as {
      currentBranch: string;
      hasUncommittedChanges: boolean;
      pendingChanges: string[];
      recentCommits: string[];
      mainBranchCI: string;
    };

    expect(parsed.currentBranch).toBe("main");
    expect(parsed.hasUncommittedChanges).toBe(false);
    expect(parsed.pendingChanges).toEqual([]);
    expect(parsed.recentCommits).toContain("abc1234 Fix something");
    expect(parsed.mainBranchCI).toBe("success");
  });

  it("reports uncommitted changes when working tree is dirty", async () => {
    const run = vi
      .fn()
      .mockReturnValueOnce("feature/my-branch")
      .mockReturnValueOnce(DIRTY_STATUS)
      .mockReturnValueOnce(COMMITS_OUTPUT)
      .mockReturnValueOnce(CI_OUTPUT);

    const result = await gitWorkflowStatus(run);
    const parsed = JSON.parse(result) as {
      currentBranch: string;
      hasUncommittedChanges: boolean;
      pendingChanges: string[];
    };

    expect(parsed.currentBranch).toBe("feature/my-branch");
    expect(parsed.hasUncommittedChanges).toBe(true);
    expect(parsed.pendingChanges).toContain("M src/index.ts");
    expect(parsed.pendingChanges).toContain("A src/new.ts");
  });

  it("returns unknown CI status when gh CLI returns error envelope", async () => {
    const run = vi
      .fn()
      .mockReturnValueOnce(BRANCH_OUTPUT)
      .mockReturnValueOnce(CLEAN_STATUS)
      .mockReturnValueOnce(COMMITS_OUTPUT)
      .mockReturnValueOnce(CI_ERROR_ENVELOPE);

    const result = await gitWorkflowStatus(run);
    const parsed = JSON.parse(result) as { mainBranchCI: string };

    expect(parsed.mainBranchCI).toBe("unknown");
  });

  it("returns unknown CI when gh returns empty array", async () => {
    const run = vi
      .fn()
      .mockReturnValueOnce(BRANCH_OUTPUT)
      .mockReturnValueOnce(CLEAN_STATUS)
      .mockReturnValueOnce(COMMITS_OUTPUT)
      .mockReturnValueOnce("[]");

    const result = await gitWorkflowStatus(run);
    const parsed = JSON.parse(result) as { mainBranchCI: string };

    expect(parsed.mainBranchCI).toBe("unknown");
  });

  it("returns error JSON when git branch command fails", async () => {
    const envelope = JSON.stringify({
      error: "Failed to get git status",
      message: "fatal: not a git repository",
    });
    const run = vi.fn().mockReturnValue(envelope);

    const result = await gitWorkflowStatus(run);
    const parsed = JSON.parse(result) as { error: string; message: string };

    expect(parsed.error).toBe("Failed to get git status");
    expect(parsed.message).toBe("fatal: not a git repository");
  });

  it("returns error JSON with object message stringified", async () => {
    const envelope = JSON.stringify({
      error: "Failed to get git status",
      message: "[object Object]",
    });
    const run = vi.fn().mockReturnValue(envelope);

    const result = await gitWorkflowStatus(run);
    const parsed = JSON.parse(result) as { error: string; message: string };

    expect(parsed.error).toBe("Failed to get git status");
  });

  it("result is a valid MCP text content string", async () => {
    const run = vi
      .fn()
      .mockReturnValueOnce(BRANCH_OUTPUT)
      .mockReturnValueOnce(CLEAN_STATUS)
      .mockReturnValueOnce(COMMITS_OUTPUT)
      .mockReturnValueOnce(CI_OUTPUT);

    const result = await gitWorkflowStatus(run);
    const mcpContent = [{ type: "text" as const, text: result }];

    expect(mcpContent[0].type).toBe("text");
    expect(typeof mcpContent[0].text).toBe("string");
  });
});
