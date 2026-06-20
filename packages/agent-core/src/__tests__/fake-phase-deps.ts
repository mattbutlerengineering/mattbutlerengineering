import { vi } from "vitest";
import type { PhaseDeps } from "../phases/index.js";

/**
 * Builds a `PhaseDeps` bundle whose every collaborator is a `vi.fn()` stub
 * with safe defaults. Phase and session-runner tests inject this (and
 * override the handful of methods they exercise) instead of `vi.mock`-ing
 * a dozen modules.
 */
export function makeFakePhaseDeps(): PhaseDeps {
  return {
    worktreeManager: {
      createWorktree: vi.fn().mockResolvedValue({
        path: "/repo/.agent-worktrees/agent-fix-bug-abc123",
        branchName: "agent/fix-bug-abc123",
        mode: "full",
      }),
      hasChanges: vi.fn().mockResolvedValue(false),
      commitChanges: vi.fn().mockResolvedValue("abc123"),
      pushBranch: vi.fn().mockResolvedValue(undefined),
      removeWorktree: vi.fn().mockResolvedValue(undefined),
    },
    promptBuilder: {
      buildSystemPrompt: vi.fn().mockResolvedValue("system prompt"),
      loadSourceFiles: vi.fn().mockResolvedValue([]),
      loadProjectContext: vi.fn().mockResolvedValue(null),
    },
    failureMemory: {
      loadMemory: vi.fn().mockResolvedValue({ records: [] }),
      queryPastFailures: vi.fn().mockReturnValue([]),
      buildFailureContext: vi.fn().mockReturnValue(""),
    },
    queryRunner: {
      runHardenedQuery: vi.fn().mockResolvedValue({
        resultMessage: null,
        stuckReason: null,
        rawTurnMetrics: [],
        rawToolCallMetrics: [],
        errorMessage: null,
        contextMetrics: null,
      }),
    },
    successEvaluator: {
      getGitDiff: vi.fn().mockResolvedValue("diff --git a/file.ts\n+change"),
    },
    gateway: {
      runPostCommitGateway: vi.fn().mockResolvedValue({
        outcome: "create-pr",
        passed: true,
        gateFailures: [],
        errors: [],
      }),
    },
    prCreator: {
      createPullRequest: vi.fn().mockResolvedValue({
        url: "https://github.com/repo/pull/1",
        number: 1,
      }),
      buildPrTitle: vi.fn().mockReturnValue("feat: test"),
      buildPrBody: vi.fn().mockReturnValue("body"),
      buildFailurePrBody: vi.fn().mockReturnValue("failure body"),
      mergeDirectly: vi.fn().mockResolvedValue("https://github.com/repo/pull/merged"),
    },
    feedbackLoop: {
      runFeedbackLoop: vi.fn().mockResolvedValue({
        resolved: false,
        retriesUsed: 0,
        lastFingerprint: null,
      }),
    },
  };
}
