import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import { createLivenessMonitor } from "./liveness-monitor.js";
import type { LivenessMonitorConfig } from "./liveness-monitor.js";

function createMockLogger(): FastifyBaseLogger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    silent: vi.fn(),
    level: "info",
  } as unknown as FastifyBaseLogger;
}

function createMockConfig(overrides: Partial<LivenessMonitorConfig> = {}): LivenessMonitorConfig {
  return {
    inactivityThresholdMs: 600_000,
    checkIntervalMs: 120_000,
    sessionService: {
      findStaleSessions: vi.fn().mockResolvedValue([]),
      addEvent: vi.fn().mockResolvedValue(null),
    },
    cancelSession: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

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

describe("createLivenessMonitor", () => {
  let mockLogger: FastifyBaseLogger;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = createMockLogger();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("start", () => {
    it("starts periodic checks", async () => {
      const config = createMockConfig();
      const monitor = createLivenessMonitor(config);
      monitor.start(mockLogger);

      await vi.advanceTimersByTimeAsync(120_000);

      expect(config.sessionService.findStaleSessions).toHaveBeenCalledWith(600_000);
      monitor.stop();
    });

    it("does not start a second monitor when already running", async () => {
      const config = createMockConfig();
      const monitor = createLivenessMonitor(config);
      monitor.start(mockLogger);
      monitor.start(mockLogger);

      await vi.advanceTimersByTimeAsync(120_000);

      expect(config.sessionService.findStaleSessions).toHaveBeenCalledTimes(1);
      monitor.stop();
    });

    it("logs info when monitor starts", () => {
      const config = createMockConfig();
      const monitor = createLivenessMonitor(config);
      monitor.start(mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("Monitor started"));
      monitor.stop();
    });
  });

  describe("stop", () => {
    it("stops the periodic checks", async () => {
      const config = createMockConfig();
      const monitor = createLivenessMonitor(config);
      monitor.start(mockLogger);
      monitor.stop();

      await vi.advanceTimersByTimeAsync(240_000);

      expect(config.sessionService.findStaleSessions).not.toHaveBeenCalled();
    });

    it("is safe to call when not running", () => {
      const config = createMockConfig();
      const monitor = createLivenessMonitor(config);

      expect(() => monitor.stop()).not.toThrow();
    });

    it("logs info when monitor stops", () => {
      const config = createMockConfig();
      const monitor = createLivenessMonitor(config);
      monitor.start(mockLogger);
      monitor.stop();

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("Monitor stopped"));
    });
  });

  describe("stale session detection", () => {
    it("cancels session returned by findStaleSessions", async () => {
      const staleSession = makeRunningSession("stale-1", new Date().toISOString());
      const config = createMockConfig({
        sessionService: {
          findStaleSessions: vi.fn().mockResolvedValueOnce([staleSession]),
          addEvent: vi.fn().mockResolvedValue(null),
        },
        cancelSession: vi.fn().mockResolvedValueOnce(true),
      });
      const monitor = createLivenessMonitor(config);
      monitor.start(mockLogger);
      await vi.advanceTimersByTimeAsync(120_000);

      expect(config.cancelSession).toHaveBeenCalledWith("stale-1");
      expect(config.sessionService.addEvent).toHaveBeenCalledWith(
        "stale-1",
        "session:error",
        expect.objectContaining({
          reason: "liveness_timeout",
        })
      );
      monitor.stop();
    });

    it("logs warn when a stale session is auto-cancelled", async () => {
      const staleSession = makeRunningSession("stale-1", new Date().toISOString());
      const config = createMockConfig({
        sessionService: {
          findStaleSessions: vi.fn().mockResolvedValueOnce([staleSession]),
          addEvent: vi.fn().mockResolvedValue(null),
        },
        cancelSession: vi.fn().mockResolvedValueOnce(true),
      });
      const monitor = createLivenessMonitor(config);
      monitor.start(mockLogger);
      await vi.advanceTimersByTimeAsync(120_000);

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("stale-1"));
      monitor.stop();
    });

    it("does not cancel when findStaleSessions returns empty", async () => {
      const config = createMockConfig({
        sessionService: {
          findStaleSessions: vi.fn().mockResolvedValueOnce([]),
          addEvent: vi.fn().mockResolvedValue(null),
        },
      });
      const monitor = createLivenessMonitor(config);
      monitor.start(mockLogger);
      await vi.advanceTimersByTimeAsync(120_000);

      expect(config.cancelSession).not.toHaveBeenCalled();
      monitor.stop();
    });

    it("does not add error event when cancellation returns false", async () => {
      const staleSession = makeRunningSession("stale-2", new Date().toISOString());
      const config = createMockConfig({
        sessionService: {
          findStaleSessions: vi.fn().mockResolvedValueOnce([staleSession]),
          addEvent: vi.fn().mockResolvedValue(null),
        },
        cancelSession: vi.fn().mockResolvedValueOnce(false),
      });
      const monitor = createLivenessMonitor(config);
      monitor.start(mockLogger);
      await vi.advanceTimersByTimeAsync(120_000);

      expect(config.cancelSession).toHaveBeenCalledWith("stale-2");
      expect(config.sessionService.addEvent).not.toHaveBeenCalledWith(
        "stale-2",
        "session:error",
        expect.anything()
      );
      monitor.stop();
    });

    it("logs error when check throws", async () => {
      const config = createMockConfig({
        sessionService: {
          findStaleSessions: vi.fn().mockRejectedValueOnce(new Error("DB unavailable")),
          addEvent: vi.fn().mockResolvedValue(null),
        },
      });
      const monitor = createLivenessMonitor(config);
      monitor.start(mockLogger);
      await vi.advanceTimersByTimeAsync(120_000);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        expect.stringContaining("Error checking stale sessions")
      );
      monitor.stop();
    });

    it("handles errors in check gracefully without crashing", async () => {
      const findStaleSessions = vi
        .fn()
        .mockRejectedValueOnce(new Error("DB unavailable"))
        .mockResolvedValueOnce([]);
      const config = createMockConfig({
        sessionService: {
          findStaleSessions,
          addEvent: vi.fn().mockResolvedValue(null),
        },
      });
      const monitor = createLivenessMonitor(config);
      monitor.start(mockLogger);
      await vi.advanceTimersByTimeAsync(120_000);
      await vi.advanceTimersByTimeAsync(120_000);

      expect(findStaleSessions).toHaveBeenCalledTimes(2);
      monitor.stop();
    });

    it("processes multiple stale sessions in one check cycle", async () => {
      const staleSessions = [
        makeRunningSession("stale-a", new Date().toISOString()),
        makeRunningSession("stale-b", new Date().toISOString()),
      ];
      const config = createMockConfig({
        sessionService: {
          findStaleSessions: vi.fn().mockResolvedValueOnce(staleSessions),
          addEvent: vi.fn().mockResolvedValue(null),
        },
        cancelSession: vi.fn().mockResolvedValue(true),
      });
      const monitor = createLivenessMonitor(config);
      monitor.start(mockLogger);
      await vi.advanceTimersByTimeAsync(120_000);

      expect(config.cancelSession).toHaveBeenCalledWith("stale-a");
      expect(config.cancelSession).toHaveBeenCalledWith("stale-b");
      monitor.stop();
    });
  });
});
