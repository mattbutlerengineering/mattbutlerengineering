import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted for mocks referenced in vi.mock factories
const mocks = vi.hoisted(() => ({
  workerProcess: vi.fn().mockResolvedValue(undefined),
  workerClose: vi.fn().mockResolvedValue(undefined),
  redisQuit: vi.fn().mockResolvedValue("OK"),
  processedJobs: [] as Array<{ name: string; data: unknown }>,
}));

vi.mock("bullmq", () => {
  class MockWorker {
    close = mocks.workerClose;
    constructor(_name: string, processor: (job: unknown) => Promise<void>, _opts?: unknown) {
      mocks.workerProcess.mockImplementation(processor);
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
import type { BookingReminderPayload } from "./job-types.js";

const mockNotificationHandler = vi.fn().mockResolvedValue(undefined);

describe("JobWorker", () => {
  beforeEach(() => {
    mocks.workerProcess.mockClear();
    mocks.workerClose.mockClear();
    mocks.redisQuit.mockClear();
    mockNotificationHandler.mockClear();
  });

  it("creates a worker connected to the queue", () => {
    const worker = new JobWorker({
      redisUrl: "redis://localhost:6379",
      handlers: { onNotification: mockNotificationHandler },
    });

    expect(worker).toBeDefined();
  });

  it("processes booking-reminder jobs and calls handler", async () => {
    new JobWorker({
      redisUrl: "redis://localhost:6379",
      handlers: { onNotification: mockNotificationHandler },
    });

    const bookingPayload: BookingReminderPayload = {
      reservationId: "res_123",
      guestPhone: "+15551234567",
      guestEmail: "guest@example.com",
      venueId: "venue_xyz",
      channel: "both",
    };

    // Simulate job processing
    await mocks.workerProcess({ name: JOB_TYPES.BOOKING_REMINDER, data: bookingPayload });

    expect(mockNotificationHandler).toHaveBeenCalledOnce();
    const call = mockNotificationHandler.mock.calls[0][0];
    expect(call.jobType).toBe(JOB_TYPES.BOOKING_REMINDER);
    expect(call.payload).toEqual(bookingPayload);
  });

  it("processes all job types by routing to handler", async () => {
    new JobWorker({
      redisUrl: "redis://localhost:6379",
      handlers: { onNotification: mockNotificationHandler },
    });

    const jobTypes = Object.values(JOB_TYPES);
    for (const jobType of jobTypes) {
      await mocks.workerProcess({ name: jobType, data: { venueId: "v1" } });
    }

    expect(mockNotificationHandler).toHaveBeenCalledTimes(jobTypes.length);
  });

  it("close() disconnects worker and Redis", async () => {
    const worker = new JobWorker({
      redisUrl: "redis://localhost:6379",
      handlers: { onNotification: mockNotificationHandler },
    });

    await worker.close();

    expect(mocks.workerClose).toHaveBeenCalledOnce();
    expect(mocks.redisQuit).toHaveBeenCalledOnce();
  });
});
