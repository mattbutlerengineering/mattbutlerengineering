import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionEvent } from "../types.js";

// Mock dependencies — same pattern as pr-feedback-poller.test.ts
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: vi.fn((fn: unknown) => fn),
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

vi.mock("../pr-feedback-poller.js", () => ({
  pollForFeedback: vi.fn(),
}));

vi.mock("../feedback-prompt-builder.js", () => ({
  buildReviewFixPrompt: vi.fn(),
}));

vi.mock("../tool-permissions.js", () => ({
  createToolPermissionHandler: vi.fn(),
}));

import { execFile } from "node:child_process";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { pollForFeedback } from "../pr-feedback-poller.js";
import { buildReviewFixPrompt } from "../feedback-prompt-builder.js";
import { createToolPermissionHandler } from "../tool-permissions.js";
import { runFeedbackLoop } from "../feedback-loop.js";
import type { FeedbackLoopParams } from "../feedback-loop.js";
import type { PollResult } from "../pr-feedback-poller.js";

const mockExecFile = vi.mocked(
  execFile as unknown as (...args: unknown[]) => Promise<{ stdout: string }>
);

const BASE_PARAMS: FeedbackLoopParams = {
  prNumber: 42,
  branchName: "agent/fix-bug-abc123",
  repoPath: "/repo",
  model: "claude-sonnet-4-6",
  maxRetries: 2,
  pollIntervalMs: 10, // Short for tests
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

async function* mockQueryGenerator(messages: unknown[]) {
  for (const msg of messages) {
    yield msg;
  }
}

describe("runFeedbackLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock gh repo view for parseOwnerRepo
    mockExecFile.mockImplementation(
      async (cmd: unknown, args: unknown, _opts?: unknown) => {
        const command = cmd as string;
        const argList = args as string[];
        if (command === "gh" && argList[0] === "repo") {
          return {
            stdout: JSON.stringify({ owner: { login: "owner" }, name: "repo" }),
          };
        }
        if (command === "git" && argList[0] === "diff") {
          // git diff --cached --quiet throws when there are changes
          throw new Error("changes exist");
        }
        if (command === "git") {
          return { stdout: "" };
        }
        return { stdout: "" };
      }
    );

    vi.mocked(createToolPermissionHandler).mockReturnValue(
      vi.fn().mockResolvedValue({ behavior: "allow" })
    );

    vi.mocked(buildReviewFixPrompt).mockReturnValue("Fix the issues");

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([
        { type: "result", subtype: "success" },
      ]) as ReturnType<typeof query>
    );
  });

  it("resolves immediately when no feedback is found", async () => {
    vi.mocked(pollForFeedback).mockResolvedValue(null);

    const result = await runFeedbackLoop(BASE_PARAMS);

    expect(result.resolved).toBe(true);
    expect(result.retriesUsed).toBe(0);
    expect(result.lastFingerprint).toBeNull();
  });

  it("runs a fix session when feedback is found and resolves after one retry", async () => {
    vi.mocked(pollForFeedback)
      .mockResolvedValueOnce(createMockPollResult())
      // After fix: no more feedback
      .mockResolvedValueOnce(null);

    const result = await runFeedbackLoop(BASE_PARAMS);

    expect(result.resolved).toBe(true);
    expect(result.retriesUsed).toBe(1);
    expect(result.lastFingerprint).toBe("thread-1");
    expect(buildReviewFixPrompt).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("escalates after exhausting maxRetries when feedback persists", async () => {
    vi.mocked(pollForFeedback).mockResolvedValue(
      createMockPollResult({ fingerprint: "persistent-thread" })
    );

    const params = { ...BASE_PARAMS, maxRetries: 2 };
    const result = await runFeedbackLoop(params);

    expect(result.resolved).toBe(false);
    expect(result.retriesUsed).toBe(2);
    expect(result.lastFingerprint).toBe("persistent-thread");
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("respects maxRetries config", async () => {
    vi.mocked(pollForFeedback).mockResolvedValue(createMockPollResult());

    const params = { ...BASE_PARAMS, maxRetries: 1 };
    const result = await runFeedbackLoop(params);

    expect(result.retriesUsed).toBe(1);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("emits events correctly throughout the loop", async () => {
    vi.mocked(pollForFeedback)
      .mockResolvedValueOnce(createMockPollResult())
      .mockResolvedValueOnce(null);

    const events: SessionEvent[] = [];
    await runFeedbackLoop(BASE_PARAMS, (event) => events.push(event));

    const messages = events.map((e) =>
      "message" in e.data ? (e.data as { message: string }).message : ""
    );

    expect(messages.some((m) => m.includes("waiting"))).toBe(true);
    expect(messages.some((m) => m.includes("found"))).toBe(true);
    expect(messages.some((m) => m.includes("fix session complete"))).toBe(true);
  });

  it("handles CI failures in feedback", async () => {
    const feedbackWithCI = createMockPollResult({
      context: {
        prNumber: 42,
        reviewComments: [],
        ciFailures: [
          {
            checkName: "lint",
            conclusion: "failure",
            logSnippet: "Error: unused variable",
          },
        ],
        reviewDecision: "PENDING",
      },
    });

    // First poll: CI feedback found; remaining polls: no feedback
    vi.mocked(pollForFeedback)
      .mockResolvedValueOnce(feedbackWithCI)
      .mockResolvedValue(null);

    const result = await runFeedbackLoop(BASE_PARAMS);

    expect(result.resolved).toBe(true);
    expect(result.retriesUsed).toBe(1);
    expect(buildReviewFixPrompt).toHaveBeenCalledWith(feedbackWithCI.context);
  });
});
