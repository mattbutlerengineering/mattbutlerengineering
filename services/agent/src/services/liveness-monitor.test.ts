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
      const config = createMockConfig({
        sessionService: {
          findStaleSessions: vi.fn().mockResolvedValueOnce(["stale-1"]),
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
      const config = createMockConfig({
        sessionService: {
          findStaleSessions: vi.fn().mockResolvedValueOnce(["stale-1"]),
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
      const config = createMockConfig({
        sessionService: {
          findStaleSessions: vi.fn().mockResolvedValueOnce(["stale-2"]),
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
      const config = createMockConfig({
        sessionService: {
          findStaleSessions: vi.fn().mockResolvedValueOnce(["stale-a", "stale-b"]),
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

    it("dispatches cancelSession for all stale sessions concurrently, not sequentially", async () => {
      let inFlight = 0;
      let maxInFlight = 0;
      const releaseFns: Array<() => void> = [];
      const cancelSession = vi.fn().mockImplementation(() => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return new Promise<boolean>((resolve) => {
          releaseFns.push(() => {
            inFlight -= 1;
            resolve(true);
          });
        });
      });
      const addEvent = vi.fn().mockResolvedValue(null);
      const config = createMockConfig({
        sessionService: {
          findStaleSessions: vi.fn().mockResolvedValueOnce(["stale-a", "stale-b"]),
          addEvent,
        },
        cancelSession,
      });
      const monitor = createLivenessMonitor(config);
      monitor.start(mockLogger);

      await vi.advanceTimersByTimeAsync(120_000);

      // A sequential `for...await` loop would only ever have 1 cancelSession
      // call in flight at a time (the next iteration can't start until the
      // previous await resolves). Both calls being in flight simultaneously
      // proves concurrent dispatch, deterministically — no wall-clock timing.
      expect(maxInFlight).toBe(2);
      expect(cancelSession).toHaveBeenCalledWith("stale-a");
      expect(cancelSession).toHaveBeenCalledWith("stale-b");

      releaseFns.forEach((release) => release());
      await vi.advanceTimersByTimeAsync(0);

      expect(addEvent).toHaveBeenCalledWith(
        "stale-a",
        "session:error",
        expect.objectContaining({ reason: "liveness_timeout" })
      );
      expect(addEvent).toHaveBeenCalledWith(
        "stale-b",
        "session:error",
        expect.objectContaining({ reason: "liveness_timeout" })
      );

      monitor.stop();
    });

    it("still processes remaining stale sessions when one cancelSession call rejects", async () => {
      const addEvent = vi.fn().mockResolvedValue(null);
      const cancelSession = vi
        .fn()
        .mockImplementationOnce(() => Promise.reject(new Error("CAS conflict")))
        .mockImplementationOnce(() => Promise.resolve(true));
      const config = createMockConfig({
        sessionService: {
          findStaleSessions: vi.fn().mockResolvedValueOnce(["stale-fail", "stale-ok"]),
          addEvent,
        },
        cancelSession,
      });
      const monitor = createLivenessMonitor(config);
      monitor.start(mockLogger);

      await vi.advanceTimersByTimeAsync(120_000);

      expect(cancelSession).toHaveBeenCalledWith("stale-fail");
      expect(cancelSession).toHaveBeenCalledWith("stale-ok");
      expect(addEvent).toHaveBeenCalledWith(
        "stale-ok",
        "session:error",
        expect.objectContaining({ reason: "liveness_timeout" })
      );
      expect(addEvent).not.toHaveBeenCalledWith("stale-fail", "session:error", expect.anything());

      monitor.stop();
    });
  });
});
