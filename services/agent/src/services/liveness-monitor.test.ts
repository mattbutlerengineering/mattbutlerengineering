import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@mbe/agent-core", () => ({
  DEFAULT_HEARTBEAT_CONFIG: {
    intervalMs: 60_000,
    inactivityTimeoutMs: 600_000,
  },
}));

vi.mock("./session.js", () => ({
  sessionService: {
    findStaleSessions: vi.fn().mockResolvedValue([]),
    addEvent: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("./session-executor.js", () => ({
  cancelSession: vi.fn().mockResolvedValue(false),
}));

import { sessionService } from "./session.js";
import { cancelSession } from "./session-executor.js";
import { startLivenessMonitor, stopLivenessMonitor } from "./liveness-monitor.js";

const makeRunningSession = (id: string, updatedAt: string) => ({
  id,
  status: "running" as const,
  taskDescription: `Task ${id}`,
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
  createdAt: updatedAt,
  updatedAt,
});

describe("liveness-monitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopLivenessMonitor();
    vi.useRealTimers();
  });

  describe("startLivenessMonitor", () => {
    it("starts periodic checks", async () => {
      startLivenessMonitor();

      await vi.advanceTimersByTimeAsync(120_000);

      expect(sessionService.findStaleSessions).toHaveBeenCalledWith(600_000);
    });

    it("does not start a second monitor when already running", async () => {
      startLivenessMonitor();
      startLivenessMonitor();

      await vi.advanceTimersByTimeAsync(120_000);

      expect(sessionService.findStaleSessions).toHaveBeenCalledTimes(1);
    });
  });

  describe("stopLivenessMonitor", () => {
    it("stops the periodic checks", async () => {
      startLivenessMonitor();
      stopLivenessMonitor();

      await vi.advanceTimersByTimeAsync(240_000);

      expect(sessionService.findStaleSessions).not.toHaveBeenCalled();
    });

    it("is safe to call when not running", () => {
      expect(() => stopLivenessMonitor()).not.toThrow();
    });
  });

  describe("stale session detection", () => {
    it("cancels session returned by findStaleSessions", async () => {
      const staleSession = makeRunningSession("stale-1", new Date().toISOString());

      vi.mocked(sessionService.findStaleSessions).mockResolvedValueOnce([staleSession]);
      vi.mocked(cancelSession).mockResolvedValueOnce(true);

      startLivenessMonitor();
      await vi.advanceTimersByTimeAsync(120_000);

      expect(cancelSession).toHaveBeenCalledWith("stale-1");
      expect(sessionService.addEvent).toHaveBeenCalledWith(
        "stale-1",
        "session:error",
        expect.objectContaining({
          reason: "liveness_timeout",
        })
      );
    });

    it("does not cancel when findStaleSessions returns empty", async () => {
      vi.mocked(sessionService.findStaleSessions).mockResolvedValueOnce([]);

      startLivenessMonitor();
      await vi.advanceTimersByTimeAsync(120_000);

      expect(cancelSession).not.toHaveBeenCalled();
    });

    it("does not add error event when cancellation returns false", async () => {
      const staleSession = makeRunningSession("stale-2", new Date().toISOString());

      vi.mocked(sessionService.findStaleSessions).mockResolvedValueOnce([staleSession]);
      vi.mocked(cancelSession).mockResolvedValueOnce(false);

      startLivenessMonitor();
      await vi.advanceTimersByTimeAsync(120_000);

      expect(cancelSession).toHaveBeenCalledWith("stale-2");
      expect(sessionService.addEvent).not.toHaveBeenCalledWith(
        "stale-2",
        "session:error",
        expect.anything()
      );
    });

    it("handles errors in check gracefully without crashing", async () => {
      vi.mocked(sessionService.findStaleSessions)
        .mockRejectedValueOnce(new Error("DB unavailable"))
        .mockResolvedValueOnce([]);

      startLivenessMonitor();
      await vi.advanceTimersByTimeAsync(120_000);

      await vi.advanceTimersByTimeAsync(120_000);

      expect(sessionService.findStaleSessions).toHaveBeenCalledTimes(2);
    });

    it("processes multiple stale sessions in one check cycle", async () => {
      const staleSessions = [
        makeRunningSession("stale-a", new Date().toISOString()),
        makeRunningSession("stale-b", new Date().toISOString()),
      ];

      vi.mocked(sessionService.findStaleSessions).mockResolvedValueOnce(staleSessions);
      vi.mocked(cancelSession).mockResolvedValue(true);

      startLivenessMonitor();
      await vi.advanceTimersByTimeAsync(120_000);

      expect(cancelSession).toHaveBeenCalledWith("stale-a");
      expect(cancelSession).toHaveBeenCalledWith("stale-b");
    });
  });
});
