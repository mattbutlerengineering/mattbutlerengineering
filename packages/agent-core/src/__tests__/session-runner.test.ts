import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionConfig, SessionEvent } from "../types.js";

// Mock all dependencies
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

vi.mock("../worktree-manager.js", () => ({
  createWorktree: vi.fn(),
  commitChanges: vi.fn(),
  pushBranch: vi.fn(),
  hasChanges: vi.fn(),
  removeWorktree: vi.fn(),
  runVerification: vi.fn(),
}));

vi.mock("../pr-creator.js", () => ({
  createPullRequest: vi.fn(),
  buildPrTitle: vi.fn(),
  buildPrBody: vi.fn(),
  buildFailurePrBody: vi.fn(),
}));

vi.mock("../success-evaluator.js", () => ({
  evaluateSuccess: vi.fn(),
  getGitDiff: vi.fn(),
  shouldEvaluate: vi.fn().mockReturnValue(true),
}));

vi.mock("../diff-reviewer.js", () => ({
  reviewDiff: vi.fn(),
}));

vi.mock("../feedback-loop.js", () => ({
  runFeedbackLoop: vi.fn(),
}));

vi.mock("../failure-memory.js", () => ({
  loadMemory: vi.fn(),
  queryPastFailures: vi.fn(),
  buildFailureContext: vi.fn(),
  recordFailure: vi.fn(),
}));

vi.mock("../prompt-builder.js", () => ({
  buildSystemPrompt: vi.fn(),
}));

vi.mock("../tool-permissions.js", () => ({
  createToolPermissionHandler: vi.fn(),
}));

import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  createWorktree,
  commitChanges,
  pushBranch,
  hasChanges,
  removeWorktree,
  runVerification,
} from "../worktree-manager.js";
import { createPullRequest, buildPrTitle, buildPrBody } from "../pr-creator.js";
import { evaluateSuccess, getGitDiff } from "../success-evaluator.js";
import { reviewDiff } from "../diff-reviewer.js";
import { runFeedbackLoop } from "../feedback-loop.js";
import { loadMemory, queryPastFailures, buildFailureContext } from "../failure-memory.js";
import { buildSystemPrompt } from "../prompt-builder.js";
import { createToolPermissionHandler } from "../tool-permissions.js";
import { runSession } from "../session-runner.js";

const BASE_CONFIG: SessionConfig = {
  taskDescription: "Fix the login bug",
  repoPath: "/repo",
  baseBranch: "main",
  model: "claude-sonnet-4-6",
  maxTurns: 50,
  maxBudgetUsd: 1.0,
  allowedTools: ["Read", "Write", "Edit", "Bash"],
  createPr: true,
};

function createMockResultMessage() {
  return {
    type: "result" as const,
    subtype: "success" as const,
    uuid: "test-uuid",
    session_id: "session-123",
    duration_ms: 5000,
    duration_api_ms: 4000,
    is_error: false,
    num_turns: 5,
    result: "Task completed",
    stop_reason: "end_turn",
    total_cost_usd: 0.25,
    usage: {
      input_tokens: 10000,
      output_tokens: 2000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
  };
}

// Helper to create an async generator from an array of messages
async function* mockQueryGenerator(messages: unknown[]) {
  for (const msg of messages) {
    yield msg;
  }
}

describe("runSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(createWorktree).mockResolvedValue({
      path: "/repo/.agent-worktrees/agent-fix-bug-abc123",
      branchName: "agent/fix-bug-abc123",
    });

    vi.mocked(buildSystemPrompt).mockReturnValue("system prompt");
    vi.mocked(createToolPermissionHandler).mockReturnValue(
      vi.fn().mockResolvedValue({ behavior: "allow" })
    );

    vi.mocked(loadMemory).mockResolvedValue({ records: [] });
    vi.mocked(queryPastFailures).mockReturnValue([]);
    vi.mocked(buildFailureContext).mockReturnValue("");

    vi.mocked(runVerification).mockResolvedValue({
      passed: true,
      lintOk: true,
      typecheckOk: true,
      testsOk: true,
    });

    vi.mocked(reviewDiff).mockResolvedValue({ approved: true, issues: [] });
    vi.mocked(runFeedbackLoop).mockResolvedValue({ resolved: false, retriesUsed: 0 });

    vi.mocked(getGitDiff).mockResolvedValue("diff --git a/file.ts\n+change");
    vi.mocked(evaluateSuccess).mockResolvedValue({
      passed: true,
      confidence: 0.95,
      reasoning: "Changes address the task",
      issues: [],
    });
  });

  it("runs a successful session with PR creation", async () => {
    const mockResult = createMockResultMessage();

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([mockResult]) as ReturnType<typeof query>
    );
    vi.mocked(hasChanges).mockResolvedValue(true);
    vi.mocked(commitChanges).mockResolvedValue("abc123");
    vi.mocked(pushBranch).mockResolvedValue(undefined);
    vi.mocked(buildPrTitle).mockReturnValue("feat: Fix the login bug");
    vi.mocked(buildPrBody).mockReturnValue("PR body");
    vi.mocked(createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/1",
      number: 1,
    });

    const result = await runSession(BASE_CONFIG);

    expect(result.status).toBe("succeeded");
    expect(result.prUrl).toBe("https://github.com/repo/pull/1");
    expect(result.branchName).toBe("agent/fix-bug-abc123");
    expect(result.costUsd).toBe(0.25);
    expect(result.numTurns).toBe(5);
    expect(createWorktree).toHaveBeenCalledWith("/repo", "main", "Fix the login bug");
    expect(commitChanges).toHaveBeenCalled();
    expect(pushBranch).toHaveBeenCalled();
    expect(createPullRequest).toHaveBeenCalled();
  });

  it("skips PR creation when no changes are made", async () => {
    const mockResult = createMockResultMessage();

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([mockResult]) as ReturnType<typeof query>
    );
    vi.mocked(hasChanges).mockResolvedValue(false);

    const result = await runSession(BASE_CONFIG);

    expect(result.status).toBe("succeeded");
    expect(result.prUrl).toBeNull();
    expect(commitChanges).not.toHaveBeenCalled();
    expect(pushBranch).not.toHaveBeenCalled();
    expect(createPullRequest).not.toHaveBeenCalled();
  });

  it("skips PR when createPr is false", async () => {
    const mockResult = createMockResultMessage();

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([mockResult]) as ReturnType<typeof query>
    );
    vi.mocked(hasChanges).mockResolvedValue(true);
    vi.mocked(commitChanges).mockResolvedValue("abc123");
    vi.mocked(pushBranch).mockResolvedValue(undefined);

    const config = { ...BASE_CONFIG, createPr: false };
    const result = await runSession(config);

    expect(result.status).toBe("succeeded");
    expect(result.prUrl).toBeNull();
    expect(createPullRequest).not.toHaveBeenCalled();
  });

  it("returns failed result when no result message is received", async () => {
    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([{ type: "system", subtype: "init" }]) as ReturnType<typeof query>
    );
    vi.mocked(hasChanges).mockResolvedValue(false);

    const result = await runSession(BASE_CONFIG);

    expect(result.status).toBe("failed");
    expect(result.errors).toContain("No result message received from agent");
  });

  it("handles errors and returns failed result", async () => {
    vi.mocked(query).mockImplementation(() => {
      throw new Error("SDK connection failed");
    });

    const result = await runSession(BASE_CONFIG);

    expect(result.status).toBe("failed");
    expect(result.errors).toContain("SDK connection failed");
  });

  it("emits events when callback is provided", async () => {
    const mockResult = createMockResultMessage();

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([mockResult]) as ReturnType<typeof query>
    );
    vi.mocked(hasChanges).mockResolvedValue(false);

    const events: SessionEvent[] = [];
    await runSession(BASE_CONFIG, (event) => events.push(event));

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe("session:start");
  });

  it("cleans up worktree after successful PR creation", async () => {
    const mockResult = createMockResultMessage();

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([mockResult]) as ReturnType<typeof query>
    );
    vi.mocked(hasChanges).mockResolvedValue(true);
    vi.mocked(commitChanges).mockResolvedValue("abc123");
    vi.mocked(pushBranch).mockResolvedValue(undefined);
    vi.mocked(buildPrTitle).mockReturnValue("feat: test");
    vi.mocked(buildPrBody).mockReturnValue("body");
    vi.mocked(createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/1",
      number: 1,
    });

    await runSession(BASE_CONFIG);

    expect(removeWorktree).toHaveBeenCalledWith(
      "/repo",
      "/repo/.agent-worktrees/agent-fix-bug-abc123"
    );
  });

  it("preserves worktree when createPr is false (--no-pr)", async () => {
    const mockResult = createMockResultMessage();

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([mockResult]) as ReturnType<typeof query>
    );
    vi.mocked(hasChanges).mockResolvedValue(true);
    vi.mocked(commitChanges).mockResolvedValue("abc123");
    vi.mocked(pushBranch).mockResolvedValue(undefined);

    await runSession({ ...BASE_CONFIG, createPr: false });

    expect(removeWorktree).not.toHaveBeenCalled();
  });

  it("handles createWorktree failure gracefully", async () => {
    vi.mocked(createWorktree).mockRejectedValue(new Error("git worktree add failed"));

    const result = await runSession(BASE_CONFIG);

    expect(result.status).toBe("failed");
    expect(result.errors).toContain("git worktree add failed");
    expect(result.branchName).toBe("");
  });
});
