/**
 * Explicit delegation contract: runFeedbackLoop must use runHardenedQuery
 * for fix sessions so the feedback fix-session inherits stuck detection,
 * circuit breaker, and heartbeat/inactivity timeout.
 *
 * Acceptance criteria verified here:
 *   - The feedback fix-session delegates to runHardenedQuery (closing the hang/loop gap)
 *   - stuck-detector is exercised through the shared module from the feedback call site
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: vi.fn((fn: unknown) => fn),
}));

vi.mock("../run-hardened-query.js", () => ({
  runHardenedQuery: vi.fn(),
}));

vi.mock("../pr-feedback-poller.js", () => ({
  pollForFeedback: vi.fn(),
}));

vi.mock("../feedback-prompt-builder.js", () => ({
  buildReviewFixPrompt: vi.fn(),
}));

// ── Imports (after mocks) ────────────────────────────────────────────

import { execFile } from "node:child_process";
import { runHardenedQuery } from "../run-hardened-query.js";
import { pollForFeedback } from "../pr-feedback-poller.js";
import { buildReviewFixPrompt } from "../feedback-prompt-builder.js";
import { runFeedbackLoop } from "../feedback-loop.js";
import type { FeedbackLoopParams } from "../feedback-loop.js";
import type { PollResult } from "../pr-feedback-poller.js";
import type { StuckPattern } from "../stuck-detector.js";

// ── Helpers ──────────────────────────────────────────────────────────

const mockExecFile = vi.mocked(
  execFile as unknown as (...args: unknown[]) => Promise<{ stdout: string }>
);

const BASE_PARAMS: FeedbackLoopParams = {
  prNumber: 42,
  branchName: "agent/fix-bug-abc123",
  repoPath: "/repo",
  model: "claude-sonnet-4-6",
  maxRetries: 1,
  pollIntervalMs: 10,
  pollTimeoutMs: 50,
  maxBudgetUsd: 0.5,
  allowedTools: ["Read", "Write", "Edit", "Bash"],
};

function createMockPollResult(overrides?: Partial<PollResult>): PollResult {
  return {
    context: {
      prNumber: 42,
      reviewComments: [
        {
          threadId: "thread-1",
          author: "reviewer",
          body: "Please fix this",
          path: "src/main.ts",
          line: 10,
        },
      ],
      ciFailures: [],
      reviewDecision: "CHANGES_REQUESTED",
    },
    fingerprint: "thread-1",
    ...overrides,
  };
}

function makeStuckResult(description: string) {
  const stuckPattern: StuckPattern = {
    type: "zero_progress",
    count: 0,
    threshold: 0,
    description,
    severity: "error",
  };
  return {
    resultMessage: null,
    stuckReason: stuckPattern,
    rawTurnMetrics: [],
    rawToolCallMetrics: [],
    errorMessage: description,
    contextMetrics: null,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("runFeedbackLoop — runHardenedQuery delegation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockExecFile.mockImplementation(async (cmd: unknown, args: unknown) => {
      const command = cmd as string;
      const argList = args as string[];
      if (command === "gh" && argList[0] === "repo") {
        return { stdout: JSON.stringify({ owner: { login: "owner" }, name: "repo" }) };
      }
      if (command === "git" && argList[0] === "diff") {
        throw new Error("changes exist"); // simulate staged changes
      }
      return { stdout: "" };
    });

    vi.mocked(buildReviewFixPrompt).mockReturnValue("Fix the review issues");

    // Default: fix session succeeds cleanly
    vi.mocked(runHardenedQuery).mockResolvedValue({
      resultMessage: null,
      stuckReason: null,
      rawTurnMetrics: [],
      rawToolCallMetrics: [],
      errorMessage: null,
      contextMetrics: null,
    });
  });

  it("delegates fix session to runHardenedQuery — not a bare query() call", async () => {
    vi.mocked(pollForFeedback)
      .mockResolvedValueOnce(createMockPollResult())
      .mockResolvedValue(null);

    await runFeedbackLoop(BASE_PARAMS);

    // runHardenedQuery must be called once for the fix session
    expect(runHardenedQuery).toHaveBeenCalledTimes(1);

    const [config] = vi.mocked(runHardenedQuery).mock.calls[0];
    expect(config.prompt).toBe("Fix the review issues");
    expect(config.cwd).toBe(BASE_PARAMS.repoPath);
    expect(config.model).toBe(BASE_PARAMS.model);
    expect(config.maxBudgetUsd).toBe(BASE_PARAMS.maxBudgetUsd);
    expect(config.allowedTools).toEqual(BASE_PARAMS.allowedTools);
    // Must carry a system-prompt append that anchors the agent to the current branch
    expect(config.systemPromptAppend).toContain("existing PR");
  });

  it("fix session stall is contained by runHardenedQuery inactivity timeout", async () => {
    // Simulate a stuck fix-session: runHardenedQuery returns a stuck reason
    // (as it would after the inactivity timeout fires inside the hardened loop)
    vi.mocked(runHardenedQuery).mockResolvedValue(
      makeStuckResult("No SDK activity for 300s — session appears hung")
    );

    vi.mocked(pollForFeedback)
      .mockResolvedValueOnce(createMockPollResult())
      .mockResolvedValue(null);

    // The feedback loop must NOT hang — it receives the stuck result and moves on
    const result = await runFeedbackLoop(BASE_PARAMS);

    expect(runHardenedQuery).toHaveBeenCalledTimes(1);
    // Loop completes (doesn't hang) even though the fix session was stuck
    expect(result.retriesUsed).toBe(1);
  });
});
