import { describe, it, expect, vi } from "vitest";

// Use vi.hoisted for mocks referenced in vi.mock factories
const mocks = vi.hoisted(() => ({
  workerClose: vi.fn().mockResolvedValue(undefined),
  redisQuit: vi.fn().mockResolvedValue("OK"),
  redisCtor: vi.fn(),
  listeners: {} as Record<string, (...args: unknown[]) => void>,
}));

vi.mock("bullmq", () => {
  class MockWorker {
    close = mocks.workerClose;
    on(event: string, fn: (...args: unknown[]) => void) {
      mocks.listeners[event] = fn;
      return this;
    }
    constructor(_name: string, _processor: unknown, _opts?: unknown) {
      // mock
    }
  }
  class UnrecoverableError extends Error {}
  return { Worker: MockWorker, UnrecoverableError };
});

vi.mock("ioredis", () => {
  class MockRedis {
    quit = mocks.redisQuit;
    status = "ready";
    constructor(url: string, opts?: unknown) {
      mocks.redisCtor(url, opts);
    }
  }
  return { Redis: MockRedis, default: MockRedis };
});

import { JobWorker } from "./worker.js";
import { JOB_TYPES } from "./job-types.js";
import type { JobHandlerMap } from "./worker.js";

function makeHandlers(): JobHandlerMap {
  return {
    [JOB_TYPES.BOOKING_REMINDER]: vi.fn().mockResolvedValue(undefined),
    [JOB_TYPES.DAY_OF_REMINDER]: vi.fn().mockResolvedValue(undefined),
    [JOB_TYPES.POST_VISIT_FOLLOWUP]: vi.fn().mockResolvedValue(undefined),
    [JOB_TYPES.WAITLIST_EXPIRY]: vi.fn().mockResolvedValue(undefined),
  };
}

describe("JobWorker lifecycle", () => {
  it("constructs Redis lazily so construction opens no connection (side-effect-free)", () => {
    mocks.redisCtor.mockClear();
    new JobWorker({
      redisUrl: "redis://localhost:6379",
      handlers: makeHandlers(),
    });

    expect(mocks.redisCtor).toHaveBeenCalledOnce();
    const [url, opts] = mocks.redisCtor.mock.calls[0]!;
    expect(url).toBe("redis://localhost:6379");
    // lazyConnect defers the connection to the first command — prevents
    // ECONNREFUSED unhandled rejections in test/CI envs with no Redis.
    expect(opts).toMatchObject({ lazyConnect: true, maxRetriesPerRequest: null });
  });

  it("creates a worker connected to the queue", () => {
    const worker = new JobWorker({
      redisUrl: "redis://localhost:6379",
      handlers: makeHandlers(),
    });

    expect(worker).toBeDefined();
  });

  it("close() disconnects worker and Redis", async () => {
    const worker = new JobWorker({
      redisUrl: "redis://localhost:6379",
      handlers: makeHandlers(),
    });

    await worker.close();

    expect(mocks.workerClose).toHaveBeenCalledOnce();
    expect(mocks.redisQuit).toHaveBeenCalledOnce();
  });

  describe("failure reporting", () => {
    it("logs a failed job with its name, id, attempts and error", () => {
      const logger = { error: vi.fn() };
      new JobWorker({
        redisUrl: "redis://localhost:6379",
        handlers: makeHandlers(),
        logger,
      });

      const err = new Error("boom");
      mocks.listeners.failed!({ id: "j1", name: JOB_TYPES.BOOKING_REMINDER, attemptsMade: 3 }, err);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "j1",
          jobName: JOB_TYPES.BOOKING_REMINDER,
          attemptsMade: 3,
          err,
        }),
        expect.any(String)
      );
    });

    it("logs worker-level errors", () => {
      const logger = { error: vi.fn() };
      new JobWorker({ redisUrl: "redis://localhost:6379", handlers: makeHandlers(), logger });

      const err = new Error("redis gone");
      mocks.listeners.error!(err);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err }),
        expect.any(String)
      );
    });
  });
});
