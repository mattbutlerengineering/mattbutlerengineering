import { describe, it, expect, vi, beforeEach } from "vitest";
import { execSync } from "node:child_process";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { gitWorkflowStatus } from "./git.js";

const BRANCH_OUTPUT = "main\n";
const CLEAN_STATUS = "";
const DIRTY_STATUS = "M src/index.ts\nA src/new.ts\n";
const COMMITS_OUTPUT = "abc1234 Fix something\ndef5678 Add feature\n";
const CI_OUTPUT = JSON.stringify([{ conclusion: "success" }]);

describe("gitWorkflowStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns full git status with CI info", async () => {
    vi.mocked(execSync)
      .mockReturnValueOnce(BRANCH_OUTPUT)
      .mockReturnValueOnce(CLEAN_STATUS)
      .mockReturnValueOnce(COMMITS_OUTPUT)
      .mockReturnValueOnce(CI_OUTPUT);

    const result = await gitWorkflowStatus();
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
    vi.mocked(execSync)
      .mockReturnValueOnce("feature/my-branch\n")
      .mockReturnValueOnce(DIRTY_STATUS)
      .mockReturnValueOnce(COMMITS_OUTPUT)
      .mockReturnValueOnce(CI_OUTPUT);

    const result = await gitWorkflowStatus();
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

  it("returns unknown CI status when gh CLI fails", async () => {
    vi.mocked(execSync)
      .mockReturnValueOnce(BRANCH_OUTPUT)
      .mockReturnValueOnce(CLEAN_STATUS)
      .mockReturnValueOnce(COMMITS_OUTPUT)
      .mockImplementationOnce(() => {
        throw new Error("gh: command not found");
      });

    const result = await gitWorkflowStatus();
    const parsed = JSON.parse(result) as { mainBranchCI: string };

    expect(parsed.mainBranchCI).toBe("unknown");
  });

  it("returns unknown CI when gh returns empty array", async () => {
    vi.mocked(execSync)
      .mockReturnValueOnce(BRANCH_OUTPUT)
      .mockReturnValueOnce(CLEAN_STATUS)
      .mockReturnValueOnce(COMMITS_OUTPUT)
      .mockReturnValueOnce("[]");

    const result = await gitWorkflowStatus();
    const parsed = JSON.parse(result) as { mainBranchCI: string };

    expect(parsed.mainBranchCI).toBe("unknown");
  });

  it("returns error JSON when git commands fail", async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("fatal: not a git repository");
    });

    const result = await gitWorkflowStatus();
    const parsed = JSON.parse(result) as { error: string; message: string };

    expect(parsed.error).toBe("Failed to get git status");
    expect(parsed.message).toBe("fatal: not a git repository");
  });

  it("returns error JSON when non-Error is thrown", async () => {
    vi.mocked(execSync).mockImplementation(() => {
       
      throw { code: 128 };
    });

    const result = await gitWorkflowStatus();
    const parsed = JSON.parse(result) as { error: string; message: string };

    expect(parsed.error).toBe("Failed to get git status");
  });

  it("result is a valid MCP text content string", async () => {
    vi.mocked(execSync)
      .mockReturnValueOnce(BRANCH_OUTPUT)
      .mockReturnValueOnce(CLEAN_STATUS)
      .mockReturnValueOnce(COMMITS_OUTPUT)
      .mockReturnValueOnce(CI_OUTPUT);

    const result = await gitWorkflowStatus();
    const mcpContent = [{ type: "text" as const, text: result }];

    expect(mcpContent[0].type).toBe("text");
    expect(typeof mcpContent[0].text).toBe("string");
  });
});
