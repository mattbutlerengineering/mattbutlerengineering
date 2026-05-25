/**
 * Integration test: schedule job → job fires → notification handler called
 * Uses in-memory BullMQ (no real Redis needed) via mocks to verify the full
 * schedule → process → handler pipeline end-to-end.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  queueAdd: vi.fn().mockResolvedValue({ id: "job_e2e_1" }),
  queueClose: vi.fn().mockResolvedValue(undefined),
  workerProcessor: null as ((job: unknown) => Promise<void>) | null,
  workerClose: vi.fn().mockResolvedValue(undefined),
  redisQuit: vi.fn().mockResolvedValue("OK"),
}));

vi.mock("bullmq", () => {
  class MockQueue {
    add = mocks.queueAdd;
    close = mocks.queueClose;
    upsertJobScheduler = vi.fn().mockResolvedValue({ id: "sched_1" });
    constructor(_name: string, _opts?: unknown) {}
  }

  class MockWorker {
    close = mocks.workerClose;
    constructor(_name: string, processor: (job: unknown) => Promise<void>, _opts?: unknown) {
      mocks.workerProcessor = processor;
    }
  }

  return { Queue: MockQueue, Worker: MockWorker };
});

vi.mock("ioredis", () => {
  class MockRedis {
    quit = mocks.redisQuit;
    status = "ready";
    constructor(_url: string, _opts?: unknown) {}
  }
  return { Redis: MockRedis, default: MockRedis };
});

import { JobScheduler } from "./scheduler.js";
import { JobWorker } from "./worker.js";
import { JOB_TYPES } from "./job-types.js";
import type { BookingReminderPayload } from "./job-types.js";

describe("JobScheduler + JobWorker integration", () => {
  beforeEach(() => {
    mocks.queueAdd.mockClear();
    mocks.queueClose.mockClear();
    mocks.workerClose.mockClear();
    mocks.redisQuit.mockClear();
    mocks.workerProcessor = null;
    mocks.queueAdd.mockResolvedValue({ id: "job_e2e_1" });
  });

  it("schedule() → worker processes → notification handler called end-to-end", async () => {
    const notificationHandler = vi.fn().mockResolvedValue(undefined);

    // Set up scheduler and worker
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });
    new JobWorker({
      redisUrl: "redis://localhost:6379",
      handlers: { onNotification: notificationHandler },
    });

    const payload: BookingReminderPayload = {
      reservationId: "res_e2e_1",
      guestPhone: "+15551234567",
      guestEmail: "test@example.com",
      venueId: "venue_abc",
      channel: "sms",
    };

    // Schedule the job
    const jobId = await scheduler.schedule(JOB_TYPES.BOOKING_REMINDER, payload, 3600000);
    expect(jobId).toBe("job_e2e_1");
    expect(mocks.queueAdd).toHaveBeenCalledOnce();

    // Simulate worker picking up the job
    expect(mocks.workerProcessor).not.toBeNull();
    await mocks.workerProcessor!({ name: JOB_TYPES.BOOKING_REMINDER, data: payload });

    // Verify notification handler was called with the correct data
    expect(notificationHandler).toHaveBeenCalledOnce();
    const handlerCall = notificationHandler.mock.calls[0][0];
    expect(handlerCall.jobType).toBe(JOB_TYPES.BOOKING_REMINDER);
    expect(handlerCall.payload).toEqual(payload);
    expect(handlerCall.payload.reservationId).toBe("res_e2e_1");

    await scheduler.close();
  });

  it("scheduleCron() sets up recurring job and worker processes it", async () => {
    const notificationHandler = vi.fn().mockResolvedValue(undefined);

    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });
    new JobWorker({
      redisUrl: "redis://localhost:6379",
      handlers: { onNotification: notificationHandler },
    });

    // Schedule cron
    await scheduler.scheduleCron(
      JOB_TYPES.LAPSED_GUEST_SCAN,
      { venueId: "venue_abc", lapsedAfterDays: 90 },
      "0 9 * * *"
    );

    // Simulate worker firing for cron job
    await mocks.workerProcessor!({
      name: JOB_TYPES.LAPSED_GUEST_SCAN,
      data: { venueId: "venue_abc", lapsedAfterDays: 90 },
    });

    expect(notificationHandler).toHaveBeenCalledOnce();
    expect(notificationHandler.mock.calls[0][0].jobType).toBe(JOB_TYPES.LAPSED_GUEST_SCAN);

    await scheduler.close();
  });
});
