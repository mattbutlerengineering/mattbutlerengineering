/**
 * Wiring test for the reservations in-process JobWorker (issue #3078).
 *
 * Proves the enqueue → dequeue → deliver pipeline: a job of each load-bearing
 * type (BOOKING_REMINDER, DAY_OF_REMINDER, WAITLIST_EXPIRY) is scheduled, then
 * dequeued and routed through the reservations JobHandlerMap to the real
 * dispatcher / waitlist re-notify path.
 *
 * @mbe/jobs is partially mocked at the import boundary: JOB_TYPES and the real
 * dispatchJob routing are kept, while JobScheduler / JobWorker become fakes so
 * no Redis is needed. The FakeWorker captures the processor (dispatchJob bound
 * to the handler map) exactly as the real worker wires it, so firing a captured
 * job exercises the genuine dequeue → dispatch → handler path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import type { Reservation, Venue } from "@mbe/types";

interface JobsModuleShape {
  dispatchJob(handlers: unknown, job: { name: string; data: unknown }): Promise<void>;
  JOB_TYPES: Record<string, string>;
}

const bus = vi.hoisted(() => ({
  scheduled: [] as Array<{ type: string; payload: unknown; delayMs: number; jobId?: string }>,
  processor: null as ((job: { name: string; data: unknown }) => Promise<void>) | null,
  schedulerClosed: false,
  workerClosed: false,
}));

vi.mock("@mbe/jobs", async (importOriginal) => {
  const actual = (await importOriginal()) as JobsModuleShape & Record<string, unknown>;

  class FakeScheduler {
    async schedule(
      type: string,
      payload: unknown,
      delayMs: number,
      jobId?: string
    ): Promise<string> {
      bus.scheduled.push({ type, payload, delayMs, jobId });
      return jobId ?? "job_1";
    }
    async close(): Promise<void> {
      bus.schedulerClosed = true;
    }
  }

  class FakeWorker {
    constructor(config: { handlers: unknown }) {
      // Mirror the real worker: process a dequeued job via dispatchJob.
      bus.processor = (job) => actual.dispatchJob(config.handlers, job);
    }
    async close(): Promise<void> {
      bus.workerClosed = true;
    }
  }

  return { ...actual, JobScheduler: FakeScheduler, JobWorker: FakeWorker };
});

import { JobScheduler, JobWorker, JOB_TYPES, dispatchJob, UnknownJobTypeError } from "@mbe/jobs";
import type { ReminderPayload } from "@mbe/jobs";
import { createReservationJobHandlers, createReservationJobWorker } from "./job-worker.js";

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res_1",
    date: "2026-07-10",
    startTime: "2026-07-10T19:00:00Z",
    endTime: "2026-07-10T21:00:00Z",
    partySize: 4,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Jane",
    guestEmail: "jane@example.com",
    guestPhone: "+15551230000",
    guestId: null,
    userId: null,
    occasion: null,
    seatingPreference: null,
    tableId: "t_1",
    guest: { visitCount: 2, communicationPreference: "both" },
    venueId: "venue_1",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    ...overrides,
  } as Reservation;
}

function makeVenue(): Venue {
  return {
    id: "venue_1",
    name: "The Oak Table",
    ianaTimezone: "America/Los_Angeles",
  } as Venue;
}

function makeDeps() {
  return {
    getReservation: vi.fn().mockResolvedValue(makeReservation()),
    getVenue: vi.fn().mockResolvedValue(makeVenue()),
    dispatcher: { sendBookingReminder: vi.fn().mockResolvedValue(undefined) },
    generateManageToken: vi.fn().mockReturnValue("tok_1"),
    handleWaitlistExpiry: vi.fn().mockResolvedValue(undefined),
  };
}

const reminderPayload: ReminderPayload = {
  reservationId: "res_1",
  venueId: "venue_1",
};

beforeEach(() => {
  vi.clearAllMocks();
  bus.scheduled = [];
  bus.processor = null;
  bus.schedulerClosed = false;
  bus.workerClosed = false;
});

describe("reservations JobWorker wiring — schedule → dequeue → deliver", () => {
  it("BOOKING_REMINDER: enqueued job is dequeued and delivers via the dispatcher", async () => {
    const deps = makeDeps();
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });
    new JobWorker({
      redisUrl: "redis://localhost:6379",
      handlers: createReservationJobHandlers(deps),
    });

    await scheduler.schedule(
      JOB_TYPES.BOOKING_REMINDER,
      reminderPayload,
      1000,
      `${JOB_TYPES.BOOKING_REMINDER}:res_1`
    );
    expect(bus.scheduled).toContainEqual(
      expect.objectContaining({ type: JOB_TYPES.BOOKING_REMINDER, payload: reminderPayload })
    );

    expect(bus.processor).not.toBeNull();
    await bus.processor!({ name: JOB_TYPES.BOOKING_REMINDER, data: reminderPayload });

    expect(deps.getReservation).toHaveBeenCalledWith("res_1");
    expect(deps.getVenue).toHaveBeenCalledWith("venue_1");
    expect(deps.generateManageToken).toHaveBeenCalledWith("res_1", "jane@example.com");
    expect(deps.dispatcher.sendBookingReminder).toHaveBeenCalledOnce();
    const [input, preference] = deps.dispatcher.sendBookingReminder.mock.calls[0];
    expect(input).toMatchObject({
      reservationId: "res_1",
      guestEmail: "jane@example.com",
      venueName: "The Oak Table",
      venueTimezone: "America/Los_Angeles",
      manageToken: "tok_1",
      partySize: 4,
    });
    expect(preference).toBe("both");

    await scheduler.close();
    expect(bus.schedulerClosed).toBe(true);
  });

  it("DAY_OF_REMINDER: enqueued job is dequeued and delivers via the dispatcher", async () => {
    const deps = makeDeps();
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });
    new JobWorker({
      redisUrl: "redis://localhost:6379",
      handlers: createReservationJobHandlers(deps),
    });

    await scheduler.schedule(
      JOB_TYPES.DAY_OF_REMINDER,
      reminderPayload,
      1000,
      `${JOB_TYPES.DAY_OF_REMINDER}:res_1`
    );
    expect(bus.scheduled).toContainEqual(
      expect.objectContaining({ type: JOB_TYPES.DAY_OF_REMINDER })
    );

    await bus.processor!({ name: JOB_TYPES.DAY_OF_REMINDER, data: reminderPayload });

    expect(deps.dispatcher.sendBookingReminder).toHaveBeenCalledOnce();
  });

  it("WAITLIST_EXPIRY: enqueued job is dequeued and reaches the handleExpiry re-notify path", async () => {
    const deps = makeDeps();
    const scheduler = new JobScheduler({ redisUrl: "redis://localhost:6379" });
    new JobWorker({
      redisUrl: "redis://localhost:6379",
      handlers: createReservationJobHandlers(deps),
    });

    // Production enqueues only { waitlistEntryId }; the handler must reach
    // handleExpiry with just that so the re-notify-next-guest path fires.
    await scheduler.schedule(
      JOB_TYPES.WAITLIST_EXPIRY,
      { waitlistEntryId: "entry_1" },
      1000,
      `${JOB_TYPES.WAITLIST_EXPIRY}:entry_1`
    );
    expect(bus.scheduled).toContainEqual(
      expect.objectContaining({ type: JOB_TYPES.WAITLIST_EXPIRY })
    );

    await bus.processor!({ name: JOB_TYPES.WAITLIST_EXPIRY, data: { waitlistEntryId: "entry_1" } });

    expect(deps.handleWaitlistExpiry).toHaveBeenCalledWith({ waitlistEntryId: "entry_1" });
    expect(deps.dispatcher.sendBookingReminder).not.toHaveBeenCalled();
  });

  it("delivers correctly for an in-flight job enqueued by pre-trim code (extra guestEmail/guestPhone/channel fields ignored)", async () => {
    const deps = makeDeps();
    new JobWorker({
      redisUrl: "redis://localhost:6379",
      handlers: createReservationJobHandlers(deps),
    });

    // Simulates a job that was already sitting in Redis, enqueued by the OLD
    // scheduler code before this deploy — it still carries the removed
    // guestEmail/guestPhone/channel fields. dispatchJob has no payload schema
    // validation (it forwards job.data as `unknown`), and deliverReminder only
    // destructures reservationId/venueId off the payload, so the extra fields
    // are simply ignored rather than rejected.
    const legacyPayload = {
      reservationId: "res_1",
      guestPhone: "+15551230000",
      guestEmail: "jane@example.com",
      venueId: "venue_1",
      channel: "both",
    };

    await bus.processor!({ name: JOB_TYPES.BOOKING_REMINDER, data: legacyPayload });

    expect(deps.getReservation).toHaveBeenCalledWith("res_1");
    expect(deps.getVenue).toHaveBeenCalledWith("venue_1");
    expect(deps.dispatcher.sendBookingReminder).toHaveBeenCalledOnce();
  });

  it("reminder handler skips delivery when the reservation is gone (no pointless retry)", async () => {
    const deps = makeDeps();
    deps.getReservation.mockResolvedValueOnce(null);
    new JobWorker({
      redisUrl: "redis://localhost:6379",
      handlers: createReservationJobHandlers(deps),
    });

    await bus.processor!({ name: JOB_TYPES.BOOKING_REMINDER, data: reminderPayload });

    expect(deps.dispatcher.sendBookingReminder).not.toHaveBeenCalled();
  });

  it("reminder handler skips delivery when the guest has no email", async () => {
    const deps = makeDeps();
    deps.getReservation.mockResolvedValueOnce(makeReservation({ guestEmail: null }));
    new JobWorker({
      redisUrl: "redis://localhost:6379",
      handlers: createReservationJobHandlers(deps),
    });

    await bus.processor!({ name: JOB_TYPES.BOOKING_REMINDER, data: reminderPayload });

    expect(deps.dispatcher.sendBookingReminder).not.toHaveBeenCalled();
  });

  it("defaults preference to email_only when the guest record has no preference", async () => {
    const deps = makeDeps();
    deps.getReservation.mockResolvedValueOnce(makeReservation({ guest: null }));
    new JobWorker({
      redisUrl: "redis://localhost:6379",
      handlers: createReservationJobHandlers(deps),
    });

    await bus.processor!({ name: JOB_TYPES.BOOKING_REMINDER, data: reminderPayload });

    const [, preference] = deps.dispatcher.sendBookingReminder.mock.calls[0];
    expect(preference).toBe("email_only");
  });

  it("throws UnknownJobTypeError for an unhandled job type so a mis-enqueued job fails loudly (never vanishes)", async () => {
    const deps = makeDeps();
    const handlers = createReservationJobHandlers(deps);

    // POST_VISIT_FOLLOWUP is a known JobType but this service registers no
    // handler for it — dispatchJob must reject, not silently no-op, so
    // BullMQ retries then marks the job failed instead of it vanishing.
    await expect(
      dispatchJob(handlers, { name: JOB_TYPES.POST_VISIT_FOLLOWUP, data: {} })
    ).rejects.toThrow(UnknownJobTypeError);
  });
});

describe("createReservationJobWorker lifecycle", () => {
  it("defers worker construction until start(), then close()s on stop()", async () => {
    const deps = makeDeps();
    const runtime = createReservationJobWorker({
      redisUrl: "redis://localhost:6379",
      handlers: createReservationJobHandlers(deps),
    });
    const log = { info: vi.fn(), error: vi.fn() } as unknown as FastifyBaseLogger;

    // Construction is side-effect-free — no worker until start().
    expect(bus.processor).toBeNull();

    runtime.start(log);
    expect(bus.processor).not.toBeNull();
    expect(log.info).toHaveBeenCalled();

    // start() is idempotent — a second call does not build a second worker.
    const processorAfterFirstStart = bus.processor;
    runtime.start(log);
    expect(bus.processor).toBe(processorAfterFirstStart);

    await runtime.stop();
    expect(bus.workerClosed).toBe(true);
  });
});
