import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so mocks are available before vi.mock hoisting
const mocks = vi.hoisted(() => ({
  add: vi.fn().mockResolvedValue({ id: "job_123" }),
  remove: vi.fn().mockResolvedValue(undefined),
  getJob: vi.fn().mockResolvedValue(undefined),
  upsertJobScheduler: vi.fn().mockResolvedValue({ id: "sched_123" }),
  close: vi.fn().mockResolvedValue(undefined),
  redisQuit: vi.fn().mockResolvedValue("OK"),
  redisCtor: vi.fn(),
}));

vi.mock("bullmq", () => {
  class MockQueue {
    add = mocks.add;
    remove = mocks.remove;
    getJob = mocks.getJob;
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
    constructor(url: string, opts?: unknown) {
      mocks.redisCtor(url, opts);
    }
  }
  return { Redis: MockRedis, default: MockRedis };
});

import { JobScheduler } from "./scheduler.js";
import { JOB_TYPES, DEFAULT_QUEUE_NAME, DEFAULT_JOB_OPTIONS } from "./job-types.js";
import type { ReminderPayload } from "./job-types.js";

const bookingPayload: ReminderPayload = {
  reservationId: "res_abc123",
  venueId: "venue_xyz",
};

describe("JobScheduler", () => {
  beforeEach(() => {
    mocks.add.mockClear();
    mocks.remove.mockClear();
    mocks.upsertJobScheduler.mockClear();
    mocks.close.mockClear();
    mocks.redisQuit.mockClear();
    mocks.redisCtor.mockClear();
    mocks.add.mockResolvedValue({ id: "job_123" });
  });

  it("constructs Redis lazily so construction opens no connection (side-effect-free)", () => {
    new JobScheduler({ redisUrl: "redis://localhost:6379" });

    expect(mocks.redisCtor).toHaveBeenCalledOnce();
    const [url, opts] = mocks.redisCtor.mock.calls[0]!;
    expect(url).toBe("redis://localhost:6379");
    // lazyConnect defers the connection to the first command, so a JobScheduler
    // can be constructed in tests / app wiring without a Redis server present.
    expect(opts).toMatchObject({ lazyConnect: true, maxRetriesPerRequest: null });
  });

  it("schedule() enqueues a delayed job with typed payload", async () => {
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });

    await scheduler.schedule(JOB_TYPES.BOOKING_REMINDER, bookingPayload, 3600000);

    expect(mocks.add).toHaveBeenCalledOnce();
    const [jobName, data, opts] = mocks.add.mock.calls[0]!;
    expect(jobName).toBe(JOB_TYPES.BOOKING_REMINDER);
    expect(data).toEqual(bookingPayload);
    expect(opts).toMatchObject({ delay: 3600000 });
  });

  it("schedule() with zero delay enqueues immediately", async () => {
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });

    await scheduler.schedule(JOB_TYPES.BOOKING_REMINDER, bookingPayload, 0);

    expect(mocks.add).toHaveBeenCalledOnce();
    const [, , opts] = mocks.add.mock.calls[0]!;
    expect(opts).toMatchObject({ delay: 0 });
  });

  it("scheduleCron() registers a repeatable cron job", async () => {
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });

    await scheduler.scheduleCron(JOB_TYPES.DAY_OF_REMINDER, bookingPayload, "0 9 * * *");

    expect(mocks.upsertJobScheduler).toHaveBeenCalledOnce();
    const [schedulerId, opts] = mocks.upsertJobScheduler.mock.calls[0]!;
    expect(schedulerId).toContain(JOB_TYPES.DAY_OF_REMINDER);
    expect(opts).toMatchObject({ pattern: "0 9 * * *" });
  });

  it("scheduleCron() passes the typed payload", async () => {
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });

    await scheduler.scheduleCron(JOB_TYPES.DAY_OF_REMINDER, bookingPayload, "0 9 * * *");

    const [, , template] = mocks.upsertJobScheduler.mock.calls[0]!;
    expect(template.data).toEqual(bookingPayload);
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

    const [, , opts] = mocks.add.mock.calls[0]!;
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

  it("cancel() reports true when the queue removed a job", async () => {
    mocks.remove.mockResolvedValueOnce(1);
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });
    await expect(scheduler.cancel("booking-reminder:res_abc")).resolves.toBe(true);
  });

  it("cancel() reports false when there was no job to remove", async () => {
    mocks.remove.mockResolvedValueOnce(0);
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });
    await expect(scheduler.cancel("booking-reminder:res_abc")).resolves.toBe(false);
  });

  it("cancel() reports false instead of throwing when removal fails", async () => {
    mocks.remove.mockRejectedValueOnce(new Error("job is locked"));
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });
    await expect(scheduler.cancel("booking-reminder:res_abc")).resolves.toBe(false);
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

    const [, , opts] = mocks.add.mock.calls[0]!;
    expect(opts).toMatchObject({ attempts: 3, backoff: { type: "exponential", delay: 1000 } });
  });

  it("schedule() gives CLOSURE_REFUND a retry window that rides out a multi-minute Stripe incident", async () => {
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });

    await scheduler.schedule(JOB_TYPES.CLOSURE_REFUND, { outcomeId: "o-1", venueId: "v-1" }, 0);

    const [, , opts] = mocks.add.mock.calls[0]!;
    expect(opts).toMatchObject({ attempts: 8, backoff: { type: "exponential", delay: 5000 } });
    // Exponential: 5s * (2^7 - 1) between 8 attempts = 635s, over ten minutes.
    const total = Array.from({ length: opts.attempts - 1 }, (_, i) => 5000 * 2 ** i).reduce(
      (a, b) => a + b
    );
    expect(total).toBeGreaterThan(10 * 60 * 1000);
  });

  describe("requeue()", () => {
    const fakeJob = (state: string) => ({
      getState: vi.fn().mockResolvedValue(state),
      remove: vi.fn().mockResolvedValue(undefined),
    });
    const requeue = () =>
      new JobScheduler({ redisUrl: "redis://localhost:6379" }).requeue(
        JOB_TYPES.BOOKING_REMINDER,
        bookingPayload,
        "base-id"
      );

    beforeEach(() => {
      mocks.getJob.mockReset();
    });

    it("adds under the base id when no job holds it", async () => {
      mocks.getJob.mockResolvedValue(undefined);

      expect(await requeue()).toBe("added");
      expect(mocks.add.mock.calls[0]![2]).toMatchObject({ jobId: "base-id", delay: 0 });
    });

    it("removes a retained failed job and re-adds under the same id", async () => {
      const job = fakeJob("failed");
      mocks.getJob.mockResolvedValue(job);

      expect(await requeue()).toBe("requeued");
      expect(job.remove).toHaveBeenCalledOnce();
      expect(mocks.add.mock.calls[0]![2]).toMatchObject({ jobId: "base-id" });
    });

    it("removes a retained completed job and re-adds under the same id", async () => {
      const job = fakeJob("completed");
      mocks.getJob.mockResolvedValue(job);

      expect(await requeue()).toBe("requeued");
      expect(job.remove).toHaveBeenCalledOnce();
      expect(mocks.add).toHaveBeenCalledOnce();
    });

    it.each(["active", "waiting", "delayed", "prioritized", "waiting-children"])(
      "leaves a %s job untouched",
      async (state) => {
        const job = fakeJob(state);
        mocks.getJob.mockResolvedValue(job);

        expect(await requeue()).toBe("live");
        expect(job.remove).not.toHaveBeenCalled();
        expect(mocks.add).not.toHaveBeenCalled();
      }
    );
  });

  it("scheduleCron() passes attempts: 3 retry policy to BullMQ", async () => {
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });

    await scheduler.scheduleCron(JOB_TYPES.DAY_OF_REMINDER, bookingPayload, "0 9 * * *");

    const [, , template] = mocks.upsertJobScheduler.mock.calls[0]!;
    expect(template.opts).toMatchObject({
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    });
  });
});
