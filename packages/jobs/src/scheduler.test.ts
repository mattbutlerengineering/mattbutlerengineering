import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so mocks are available before vi.mock hoisting
const mocks = vi.hoisted(() => ({
  add: vi.fn().mockResolvedValue({ id: "job_123" }),
  remove: vi.fn().mockResolvedValue(undefined),
  upsertJobScheduler: vi.fn().mockResolvedValue({ id: "sched_123" }),
  close: vi.fn().mockResolvedValue(undefined),
  redisQuit: vi.fn().mockResolvedValue("OK"),
}));

vi.mock("bullmq", () => {
  class MockQueue {
    add = mocks.add;
    remove = mocks.remove;
    upsertJobScheduler = mocks.upsertJobScheduler;
    close = mocks.close;
    constructor(_name: string, _opts?: unknown) {
      // mock
    }
  }
  return { Queue: MockQueue };
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

import { JobScheduler } from "./scheduler.js";
import { JOB_TYPES, DEFAULT_QUEUE_NAME, DEFAULT_JOB_OPTIONS } from "./job-types.js";
import type { BookingReminderPayload, LapsedGuestScanPayload } from "./job-types.js";

const bookingPayload: BookingReminderPayload = {
  reservationId: "res_abc123",
  guestPhone: "+15551234567",
  guestEmail: "jane@example.com",
  venueId: "venue_xyz",
  channel: "both",
};

const lapsedPayload: LapsedGuestScanPayload = {
  venueId: "venue_xyz",
  lapsedAfterDays: 90,
};

describe("JobScheduler", () => {
  beforeEach(() => {
    mocks.add.mockClear();
    mocks.remove.mockClear();
    mocks.upsertJobScheduler.mockClear();
    mocks.close.mockClear();
    mocks.redisQuit.mockClear();
    mocks.add.mockResolvedValue({ id: "job_123" });
  });

  it("schedule() enqueues a delayed job with typed payload", async () => {
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });

    await scheduler.schedule(JOB_TYPES.BOOKING_REMINDER, bookingPayload, 3600000);

    expect(mocks.add).toHaveBeenCalledOnce();
    const [jobName, data, opts] = mocks.add.mock.calls[0];
    expect(jobName).toBe(JOB_TYPES.BOOKING_REMINDER);
    expect(data).toEqual(bookingPayload);
    expect(opts).toMatchObject({ delay: 3600000 });
  });

  it("schedule() with zero delay enqueues immediately", async () => {
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });

    await scheduler.schedule(JOB_TYPES.BOOKING_REMINDER, bookingPayload, 0);

    expect(mocks.add).toHaveBeenCalledOnce();
    const [, , opts] = mocks.add.mock.calls[0];
    expect(opts).toMatchObject({ delay: 0 });
  });

  it("scheduleCron() registers a repeatable cron job", async () => {
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });

    await scheduler.scheduleCron(JOB_TYPES.LAPSED_GUEST_SCAN, lapsedPayload, "0 9 * * *");

    expect(mocks.upsertJobScheduler).toHaveBeenCalledOnce();
    const [schedulerId, opts] = mocks.upsertJobScheduler.mock.calls[0];
    expect(schedulerId).toContain(JOB_TYPES.LAPSED_GUEST_SCAN);
    expect(opts).toMatchObject({ pattern: "0 9 * * *" });
  });

  it("scheduleCron() passes the typed payload", async () => {
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });

    await scheduler.scheduleCron(JOB_TYPES.LAPSED_GUEST_SCAN, lapsedPayload, "0 9 * * *");

    const [, , template] = mocks.upsertJobScheduler.mock.calls[0];
    expect(template.data).toEqual(lapsedPayload);
  });

  it("close() disconnects from Redis and BullMQ", async () => {
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });

    await scheduler.close();

    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.redisQuit).toHaveBeenCalledOnce();
  });

  it("returns job id from schedule()", async () => {
    mocks.add.mockResolvedValueOnce({ id: "job_456" });
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });

    const result = await scheduler.schedule(JOB_TYPES.BOOKING_REMINDER, bookingPayload, 5000);

    expect(result).toBe("job_456");
  });

  it("schedule() passes jobId as opts.jobId when provided", async () => {
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });
    const knownId = "booking-reminder:res_abc";

    await scheduler.schedule(JOB_TYPES.BOOKING_REMINDER, bookingPayload, 3600000, knownId);

    const [, , opts] = mocks.add.mock.calls[0];
    expect(opts).toMatchObject({ jobId: knownId });
  });

  it("schedule() returns the provided jobId when one is given", async () => {
    const knownId = "booking-reminder:res_abc";
    mocks.add.mockResolvedValueOnce({ id: knownId });
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });

    const result = await scheduler.schedule(
      JOB_TYPES.BOOKING_REMINDER,
      bookingPayload,
      3600000,
      knownId
    );

    expect(result).toBe(knownId);
  });

  it("cancel() round-trip: schedule with known id → cancel calls queue.remove with that id", async () => {
    const knownId = "booking-reminder:res_abc";
    mocks.add.mockResolvedValueOnce({ id: knownId });
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });

    await scheduler.schedule(JOB_TYPES.BOOKING_REMINDER, bookingPayload, 3600000, knownId);
    await scheduler.cancel(knownId);

    expect(mocks.remove).toHaveBeenCalledWith(knownId);
  });

  it("DEFAULT_QUEUE_NAME is exported from job-types and equals 'mbe-notifications'", () => {
    expect(DEFAULT_QUEUE_NAME).toBe("mbe-notifications");
  });

  it("DEFAULT_JOB_OPTIONS is exported from job-types with attempts: 3 and exponential backoff", () => {
    expect(DEFAULT_JOB_OPTIONS).toMatchObject({
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    });
  });

  it("schedule() passes attempts: 3 retry policy to BullMQ", async () => {
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });

    await scheduler.schedule(JOB_TYPES.BOOKING_REMINDER, bookingPayload, 3600000);

    const [, , opts] = mocks.add.mock.calls[0];
    expect(opts).toMatchObject({ attempts: 3, backoff: { type: "exponential", delay: 1000 } });
  });

  it("scheduleCron() passes attempts: 3 retry policy to BullMQ", async () => {
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });

    await scheduler.scheduleCron(JOB_TYPES.LAPSED_GUEST_SCAN, lapsedPayload, "0 9 * * *");

    const [, , template] = mocks.upsertJobScheduler.mock.calls[0];
    expect(template.opts).toMatchObject({
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    });
  });
});
