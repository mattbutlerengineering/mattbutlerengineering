import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock("./session.js", () => ({
  sessionService: {
    updateStatus: vi.fn().mockResolvedValue(null),
    addEvent: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("@mbe/agent-core", () => ({
  runSession: vi.fn(),
  DEFAULT_SESSION_CONFIG: {
    allowedTools: ["Bash", "Read", "Write", "Edit"],
  },
}));

import { runSession } from "@mbe/agent-core";
import { sessionService } from "./session.js";
import {
  executeSession,
  cancelSession,
  getActiveSessionCount,
  _testHelpers,
} from "./session-executor.js";
import type { AgentSession } from "@mbe/types";

const { truncate, extractText, summarizeToolInput } = _testHelpers;

const makeSession = (overrides: Partial<AgentSession> = {}): AgentSession => ({
  id: "test-session-1",
  status: "pending",
  taskDescription: "Fix the login bug",
  branchName: null,
  baseBranch: "main",
  model: "claude-sonnet-4-6",
  maxTurns: 50,
  maxBudgetUsd: 1.0,
  prUrl: null,
  prNumber: null,
  resultText: null,
  costUsd: null,
  inputTokens: null,
  outputTokens: null,
  numTurns: null,
  durationMs: null,
  parentId: null,
  errors: [],
  startedAt: null,
  completedAt: null,
  createdAt: "2026-03-01T12:00:00.000Z",
  updatedAt: "2026-03-01T12:00:00.000Z",
  ...overrides,
});

const makeSuccessResult = () => ({
  status: "succeeded" as const,
  branchName: "agent/fix-login",
  prUrl: "https://github.com/org/repo/pull/42",
  resultText: "Fixed the login bug",
  costUsd: 0.5,
  tokenUsage: { inputTokens: 1000, outputTokens: 2000 },
  numTurns: 5,
  durationMs: 30000,
  errors: [] as string[],
  sessionId: "sdk-sess-1",
});

describe("session-executor", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(sessionService.updateStatus).mockResolvedValue(null);
    vi.mocked(sessionService.addEvent).mockResolvedValue(null as never);
  });

  describe("truncate", () => {
    it("returns string unchanged when shorter than maxLen", () => {
      expect(truncate("hello", 10)).toBe("hello");
    });

    it("returns string unchanged when exactly maxLen", () => {
      expect(truncate("hello", 5)).toBe("hello");
    });

    it("truncates and appends ellipsis when longer than maxLen", () => {
      const result = truncate("hello world", 6);
      expect(result).toBe("hello…");
      expect(result.length).toBe(6);
    });
  });

  describe("extractText", () => {
    it("returns string content directly", () => {
      expect(extractText("hello")).toBe("hello");
    });

    it("returns empty string for non-array, non-string content", () => {
      expect(extractText(42)).toBe("");
      expect(extractText(null)).toBe("");
      expect(extractText(undefined)).toBe("");
      expect(extractText({})).toBe("");
    });

    it("extracts text from content block array", () => {
      const blocks = [
        { type: "text", text: "Hello" },
        { type: "text", text: "World" },
      ];
      expect(extractText(blocks)).toBe("Hello\nWorld");
    });

    it("filters out non-text blocks", () => {
      const blocks = [
        { type: "text", text: "Hello" },
        { type: "tool_use", id: "123" },
        { type: "text", text: "World" },
      ];
      expect(extractText(blocks)).toBe("Hello\nWorld");
    });

    it("returns empty string for empty array", () => {
      expect(extractText([])).toBe("");
    });
  });

  describe("summarizeToolInput", () => {
    it("returns empty object for null/undefined input", () => {
      expect(summarizeToolInput(null)).toEqual({});
      expect(summarizeToolInput(undefined)).toEqual({});
    });

    it("returns empty object for non-object input", () => {
      expect(summarizeToolInput("string")).toEqual({});
      expect(summarizeToolInput(42)).toEqual({});
    });

    it("captures file_path", () => {
      expect(summarizeToolInput({ file_path: "/src/auth.ts" })).toEqual({
        file_path: "/src/auth.ts",
      });
    });

    it("captures command with truncation", () => {
      const longCommand = "a".repeat(300);
      const result = summarizeToolInput({ command: longCommand });
      expect(result.command).toHaveLength(200);
    });

    it("captures short command without truncation", () => {
      expect(summarizeToolInput({ command: "ls -la" })).toEqual({
        command: "ls -la",
      });
    });

    it("captures pattern", () => {
      expect(summarizeToolInput({ pattern: "*.ts" })).toEqual({
        pattern: "*.ts",
      });
    });

    it("captures path when file_path is not present", () => {
      expect(summarizeToolInput({ path: "/src" })).toEqual({
        path: "/src",
      });
    });

    it("prefers file_path over path", () => {
      const result = summarizeToolInput({
        file_path: "/src/auth.ts",
        path: "/src",
      });
      expect(result).toEqual({ file_path: "/src/auth.ts" });
      expect(result).not.toHaveProperty("path");
    });

    it("combines multiple fields", () => {
      const result = summarizeToolInput({
        file_path: "/src/auth.ts",
        command: "cat file",
        pattern: "*.ts",
      });
      expect(result).toEqual({
        file_path: "/src/auth.ts",
        command: "cat file",
        pattern: "*.ts",
      });
    });
  });

  describe("getActiveSessionCount", () => {
    it("returns 0 when no sessions are active", () => {
      expect(getActiveSessionCount()).toBe(0);
    });
  });

  describe("executeSession", () => {
    it("runs session successfully and updates status to SUCCEEDED", async () => {
      const result = makeSuccessResult();
      vi.mocked(runSession).mockResolvedValueOnce(result);

      await executeSession(makeSession());

      expect(sessionService.updateStatus).toHaveBeenCalledWith("test-session-1", "RUNNING");
      expect(sessionService.addEvent).toHaveBeenCalledWith("test-session-1", "session:start", {
        message: "Session execution started",
      });
      expect(runSession).toHaveBeenCalledWith(
        expect.objectContaining({
          taskDescription: "Fix the login bug",
          model: "claude-sonnet-4-6",
          maxTurns: 50,
          maxBudgetUsd: 1.0,
          baseBranch: "main",
        }),
        expect.any(Function)
      );
      expect(sessionService.updateStatus).toHaveBeenCalledWith(
        "test-session-1",
        "SUCCEEDED",
        expect.objectContaining({
          branchName: "agent/fix-login",
          prUrl: "https://github.com/org/repo/pull/42",
          costUsd: 0.5,
          inputTokens: 1000,
          outputTokens: 2000,
          numTurns: 5,
          durationMs: 30000,
          errors: [],
          sdkSessionId: "sdk-sess-1",
        })
      );
      expect(sessionService.addEvent).toHaveBeenCalledWith(
        "test-session-1",
        "session:complete",
        expect.objectContaining({
          status: "SUCCEEDED",
          costUsd: 0.5,
        })
      );
    });

    it("updates status to FAILED when runSession returns failed status", async () => {
      const result = {
        ...makeSuccessResult(),
        status: "failed" as const,
        errors: ["Budget exceeded"],
      };
      vi.mocked(runSession).mockResolvedValueOnce(result);

      await executeSession(makeSession());

      expect(sessionService.updateStatus).toHaveBeenCalledWith(
        "test-session-1",
        "FAILED",
        expect.objectContaining({
          errors: ["Budget exceeded"],
        })
      );
    });

    it("handles runSession throwing an error", async () => {
      vi.mocked(runSession).mockRejectedValueOnce(new Error("SDK connection failed"));

      await executeSession(makeSession());

      expect(sessionService.updateStatus).toHaveBeenCalledWith("test-session-1", "FAILED", {
        errors: ["SDK connection failed"],
      });
      expect(sessionService.addEvent).toHaveBeenCalledWith("test-session-1", "session:error", {
        message: "SDK connection failed",
      });
    });

    it("handles non-Error thrown values", async () => {
      vi.mocked(runSession).mockRejectedValueOnce("string error");

      await executeSession(makeSession());

      expect(sessionService.updateStatus).toHaveBeenCalledWith("test-session-1", "FAILED", {
        errors: ["string error"],
      });
    });

    it("rejects when max concurrent sessions reached", async () => {
      const resolvers: (() => void)[] = [];

      vi.mocked(runSession).mockImplementation(async () => {
        await new Promise<void>((resolve) => {
          resolvers.push(resolve);
        });
        return makeSuccessResult();
      });

      const sessions = Array.from({ length: 5 }, (_, i) => makeSession({ id: `concurrent-${i}` }));
      const promises = sessions.map((s) => executeSession(s));

      // Wait for all 5 to enter runSession (controllers registered)
      while (resolvers.length < 5) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      expect(getActiveSessionCount()).toBe(5);

      const sixthSession = makeSession({ id: "concurrent-5" });
      await executeSession(sixthSession);

      expect(sessionService.updateStatus).toHaveBeenCalledWith("concurrent-5", "FAILED", {
        errors: [expect.stringContaining("Max concurrent sessions")],
      });

      resolvers.forEach((r) => r());
      await Promise.all(promises);
      expect(getActiveSessionCount()).toBe(0);
    });

    it("cleans up active controller on completion", async () => {
      vi.mocked(runSession).mockResolvedValueOnce(makeSuccessResult());

      await executeSession(makeSession());

      expect(getActiveSessionCount()).toBe(0);
    });

    it("cleans up active controller on error", async () => {
      vi.mocked(runSession).mockRejectedValueOnce(new Error("crash"));

      await executeSession(makeSession());

      expect(getActiveSessionCount()).toBe(0);
    });

    it("invokes onEvent callback for session events", async () => {
      vi.mocked(runSession).mockImplementationOnce(async (_config, onEvent) => {
        const fn = onEvent as (event: unknown) => Promise<void>;
        await fn({
          type: "session:message",
          data: { message: "Processing..." },
        });
        return makeSuccessResult();
      });

      await executeSession(makeSession());

      expect(sessionService.addEvent).toHaveBeenCalledWith("test-session-1", "session:message", {
        message: "Processing...",
      });
    });

    it("handles tool_use events with summarized input", async () => {
      vi.mocked(runSession).mockImplementationOnce(async (_config, onEvent) => {
        const fn = onEvent as (event: unknown) => Promise<void>;
        await fn({
          type: "session:tool_use",
          data: {
            tool_name: "Read",
            input: { file_path: "/src/auth.ts" },
          },
        });
        return makeSuccessResult();
      });

      await executeSession(makeSession());

      expect(sessionService.addEvent).toHaveBeenCalledWith(
        "test-session-1",
        "session:tool_use",
        expect.objectContaining({
          toolName: "Read",
          toolInput: { file_path: "/src/auth.ts" },
        })
      );
    });

    it("handles assistant message events with text preview", async () => {
      vi.mocked(runSession).mockImplementationOnce(async (_config, onEvent) => {
        const fn = onEvent as (event: unknown) => Promise<void>;
        await fn({
          type: "session:sdk_message",
          data: {
            type: "assistant",
            content: [{ type: "text", text: "I will fix the bug" }],
          },
        });
        return makeSuccessResult();
      });

      await executeSession(makeSession());

      expect(sessionService.addEvent).toHaveBeenCalledWith(
        "test-session-1",
        "session:assistant",
        expect.objectContaining({
          textPreview: "I will fix the bug",
        })
      );
    });

    it("does not crash when event logging fails", async () => {
      vi.mocked(sessionService.addEvent)
        .mockRejectedValueOnce(new Error("DB down"))
        .mockResolvedValue(null as never);

      vi.mocked(runSession).mockImplementationOnce(async (_config, onEvent) => {
        const fn = onEvent as (event: unknown) => Promise<void>;
        await fn({
          type: "session:message",
          data: { message: "test" },
        });
        return makeSuccessResult();
      });

      await expect(executeSession(makeSession())).resolves.toBeUndefined();
    });
  });

  describe("cancelSession", () => {
    it("returns false when session is not active", async () => {
      const result = await cancelSession("nonexistent");
      expect(result).toBe(false);
    });

    it("cancels an active session and returns true", async () => {
      let resolveRun!: () => void;
      const resolvers: (() => void)[] = [];

      vi.mocked(runSession).mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => {
          resolveRun = resolve;
          resolvers.push(resolve);
        });
        return makeSuccessResult();
      });

      const session = makeSession({ id: "cancel-target" });
      const execPromise = executeSession(session);

      while (resolvers.length < 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      const cancelled = await cancelSession("cancel-target");
      expect(cancelled).toBe(true);

      expect(sessionService.updateStatus).toHaveBeenCalledWith("cancel-target", "CANCELLED", {
        errors: ["Cancelled by user"],
      });
      expect(sessionService.addEvent).toHaveBeenCalledWith("cancel-target", "session:cancelled", {
        message: "Session cancelled by user",
      });

      resolveRun();
      await execPromise.catch(() => {});
    });
  });
});
