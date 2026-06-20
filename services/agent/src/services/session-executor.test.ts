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
  createSessionExecutor,
} from "./session-executor.js";
import { createSessionConcurrency } from "./session-concurrency.js";
import type { AgentSession } from "@mbe/types";

const makeSession = (overrides: Partial<AgentSession> = {}): AgentSession => ({
  id: "test-session-1",
  status: "pending",
  taskDescription: "Fix the login bug",
  userId: null,
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

      // Wait for all 5 to enter runSession (controllers registered).
      // Use microtask-yield loop instead of setTimeout to avoid timer-starvation
      // flakiness under full parallel turbo load (CI environment).
      while (resolvers.length < 5) {
        await Promise.resolve();
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

    it("stores plain message events (session:start etc.) as-is", async () => {
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

    it("handles tool_use MappedEvents (JSON in message) with summarized input", async () => {
      const mappedEvent = {
        type: "session:tool_use",
        toolName: "Read",
        toolInput: { file_path: "/src/auth.ts" },
        toolUseId: "tu_1",
      };
      vi.mocked(runSession).mockImplementationOnce(async (_config, onEvent) => {
        const fn = onEvent as (event: unknown) => Promise<void>;
        await fn({
          type: "session:tool_use",
          data: { message: JSON.stringify(mappedEvent) },
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

    it("handles assistant MappedEvents (JSON in message) with text preview", async () => {
      const mappedEvent = {
        type: "session:assistant",
        text: "I will fix the bug",
      };
      vi.mocked(runSession).mockImplementationOnce(async (_config, onEvent) => {
        const fn = onEvent as (event: unknown) => Promise<void>;
        await fn({
          type: "session:assistant",
          data: { message: JSON.stringify(mappedEvent) },
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

      // Microtask-yield loop — immune to timer starvation under full parallel load.
      while (resolvers.length < 1) {
        await Promise.resolve();
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

  describe("createSessionExecutor factory", () => {
    it("exports createSessionExecutor as a named export", () => {
      expect(typeof createSessionExecutor).toBe("function");
    });

    it("returns an object with executeSession, cancelSession, getActiveSessionCount", () => {
      const executor = createSessionExecutor({
        concurrency: createSessionConcurrency(2),
        sessionService,
      });
      expect(typeof executor.executeSession).toBe("function");
      expect(typeof executor.cancelSession).toBe("function");
      expect(typeof executor.getActiveSessionCount).toBe("function");
    });

    it("two instances do not share active controllers", async () => {
      const resolvers: (() => void)[] = [];
      vi.mocked(runSession).mockImplementation(async () => {
        await new Promise<void>((resolve) => {
          resolvers.push(resolve);
        });
        return makeSuccessResult();
      });

      const instanceA = createSessionExecutor({
        concurrency: createSessionConcurrency(5),
        sessionService,
      });
      const instanceB = createSessionExecutor({
        concurrency: createSessionConcurrency(5),
        sessionService,
      });

      const sessionA = makeSession({ id: "iso-a" });
      const promiseA = instanceA.executeSession(sessionA);

      while (resolvers.length < 1) {
        await Promise.resolve();
      }

      // instanceA has 1 active, instanceB must have 0
      expect(instanceA.getActiveSessionCount()).toBe(1);
      expect(instanceB.getActiveSessionCount()).toBe(0);

      resolvers.forEach((r) => r());
      await promiseA;
    });

    it("respects its own concurrency gate independent of other instances", async () => {
      const resolvers: (() => void)[] = [];
      vi.mocked(runSession).mockImplementation(async () => {
        await new Promise<void>((resolve) => {
          resolvers.push(resolve);
        });
        return makeSuccessResult();
      });

      // Instance with cap of 1
      const tightExecutor = createSessionExecutor({
        concurrency: createSessionConcurrency(1),
        sessionService,
      });

      const first = makeSession({ id: "tight-0" });
      const firstPromise = tightExecutor.executeSession(first);

      while (resolvers.length < 1) {
        await Promise.resolve();
      }

      expect(tightExecutor.getActiveSessionCount()).toBe(1);

      // Second session should be rejected because cap is 1
      const second = makeSession({ id: "tight-1" });
      await tightExecutor.executeSession(second);

      expect(sessionService.updateStatus).toHaveBeenCalledWith(
        "tight-1",
        "FAILED",
        expect.objectContaining({
          errors: [expect.stringContaining("Max concurrent sessions")],
        })
      );

      resolvers.forEach((r) => r());
      await firstPromise;
    });

    it("cancelSession on one instance does not affect another instance", async () => {
      const resolvers: (() => void)[] = [];
      vi.mocked(runSession).mockImplementation(async () => {
        await new Promise<void>((resolve) => {
          resolvers.push(resolve);
        });
        return makeSuccessResult();
      });

      const instanceA = createSessionExecutor({
        concurrency: createSessionConcurrency(5),
        sessionService,
      });
      const instanceB = createSessionExecutor({
        concurrency: createSessionConcurrency(5),
        sessionService,
      });

      const sessionA = makeSession({ id: "cross-cancel" });
      const promiseA = instanceA.executeSession(sessionA);

      while (resolvers.length < 1) {
        await Promise.resolve();
      }

      // cancelSession on instanceB for same ID returns false — it doesn't know about it
      const result = await instanceB.cancelSession("cross-cancel");
      expect(result).toBe(false);

      resolvers.forEach((r) => r());
      await promiseA;
    });
  });
});
