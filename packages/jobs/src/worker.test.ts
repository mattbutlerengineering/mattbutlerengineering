import { describe, it, expect, vi } from "vitest";

// Use vi.hoisted for mocks referenced in vi.mock factories
const mocks = vi.hoisted(() => ({
  workerClose: vi.fn().mockResolvedValue(undefined),
  redisQuit: vi.fn().mockResolvedValue("OK"),
}));

vi.mock("bullmq", () => {
  class MockWorker {
    close = mocks.workerClose;
    constructor(_name: string, _processor: unknown, _opts?: unknown) {
      // mock
    }
  }
  return { Worker: MockWorker };
});

vi.mock("ioredis", () => {
  class MockRedis {
    quit = mocks.redisQuit;
    status = "ready";
    constructor(_url: string, _opts?: unknown) {
      // mock
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
    [JOB_TYPES.PRE_ARRIVAL_BRIEFING]: vi.fn().mockResolvedValue(undefined),
    [JOB_TYPES.LAPSED_GUEST_SCAN]: vi.fn().mockResolvedValue(undefined),
    [JOB_TYPES.WAITLIST_EXPIRY]: vi.fn().mockResolvedValue(undefined),
  };
}

describe("JobWorker lifecycle", () => {
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
});
