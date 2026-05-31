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
import type { BookingReminderPayload, JobHandlerMap } from "./index.js";

function makeHandlers(overrides: Partial<JobHandlerMap> = {}): JobHandlerMap {
  return {
    [JOB_TYPES.BOOKING_REMINDER]: vi.fn().mockResolvedValue(undefined),
    [JOB_TYPES.DAY_OF_REMINDER]: vi.fn().mockResolvedValue(undefined),
    [JOB_TYPES.POST_VISIT_FOLLOWUP]: vi.fn().mockResolvedValue(undefined),
    [JOB_TYPES.PRE_ARRIVAL_BRIEFING]: vi.fn().mockResolvedValue(undefined),
    [JOB_TYPES.LAPSED_GUEST_SCAN]: vi.fn().mockResolvedValue(undefined),
    [JOB_TYPES.WAITLIST_EXPIRY]: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("JobScheduler + JobWorker integration", () => {
  beforeEach(() => {
    mocks.queueAdd.mockClear();
    mocks.queueClose.mockClear();
    mocks.workerClose.mockClear();
    mocks.redisQuit.mockClear();
    mocks.workerProcessor = null;
    mocks.queueAdd.mockResolvedValue({ id: "job_e2e_1" });
  });

  it("schedule() → worker processes → booking-reminder handler called end-to-end", async () => {
    const bookingReminderHandler = vi.fn().mockResolvedValue(undefined);
    const handlers = makeHandlers({ [JOB_TYPES.BOOKING_REMINDER]: bookingReminderHandler });

    // Set up scheduler and worker
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });
    new JobWorker({
      redisUrl: "redis://localhost:6379",
      handlers,
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

    // Verify the dedicated handler was called directly with the payload
    expect(bookingReminderHandler).toHaveBeenCalledOnce();
    expect(bookingReminderHandler).toHaveBeenCalledWith(payload);

    await scheduler.close();
  });

  it("scheduleCron() sets up recurring job and lapsed-guest-scan handler called", async () => {
    const lapsedGuestScanHandler = vi.fn().mockResolvedValue(undefined);
    const handlers = makeHandlers({ [JOB_TYPES.LAPSED_GUEST_SCAN]: lapsedGuestScanHandler });

    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });
    new JobWorker({
      redisUrl: "redis://localhost:6379",
      handlers,
    });

    const lapsedPayload = { venueId: "venue_abc", lapsedAfterDays: 90 };

    // Schedule cron
    await scheduler.scheduleCron(JOB_TYPES.LAPSED_GUEST_SCAN, lapsedPayload, "0 9 * * *");

    // Simulate worker firing for cron job
    await mocks.workerProcessor!({
      name: JOB_TYPES.LAPSED_GUEST_SCAN,
      data: lapsedPayload,
    });

    expect(lapsedGuestScanHandler).toHaveBeenCalledOnce();
    expect(lapsedGuestScanHandler).toHaveBeenCalledWith(lapsedPayload);

    await scheduler.close();
  });
});
