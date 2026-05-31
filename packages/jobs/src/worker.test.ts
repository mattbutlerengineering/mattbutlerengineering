import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted for mocks referenced in vi.mock factories
const mocks = vi.hoisted(() => ({
  workerProcess: vi.fn().mockResolvedValue(undefined),
  workerClose: vi.fn().mockResolvedValue(undefined),
  redisQuit: vi.fn().mockResolvedValue("OK"),
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
import type {
  BookingReminderPayload,
  DayOfReminderPayload,
  PostVisitFollowupPayload,
  PreArrivalBriefingPayload,
  LapsedGuestScanPayload,
  WaitlistExpiryPayload,
} from "./job-types.js";
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

describe("JobWorker with JobHandlerMap", () => {
  beforeEach(() => {
    mocks.workerProcess.mockClear();
    mocks.workerClose.mockClear();
    mocks.redisQuit.mockClear();
  });

  it("creates a worker connected to the queue", () => {
    const worker = new JobWorker({
      redisUrl: "redis://localhost:6379",
      handlers: makeHandlers(),
    });

    expect(worker).toBeDefined();
  });

  it("routes booking-reminder to its dedicated handler with typed payload", async () => {
    const handlers = makeHandlers();

    new JobWorker({
      redisUrl: "redis://localhost:6379",
      handlers,
    });

    const bookingPayload: BookingReminderPayload = {
      reservationId: "res_123",
      guestPhone: "+15551234567",
      guestEmail: "guest@example.com",
      venueId: "venue_xyz",
      channel: "both",
    };

    await mocks.workerProcess({ name: JOB_TYPES.BOOKING_REMINDER, data: bookingPayload });

    expect(handlers[JOB_TYPES.BOOKING_REMINDER]).toHaveBeenCalledOnce();
    expect(handlers[JOB_TYPES.BOOKING_REMINDER]).toHaveBeenCalledWith(bookingPayload);
    // Other handlers must not fire
    expect(handlers[JOB_TYPES.DAY_OF_REMINDER]).not.toHaveBeenCalled();
    expect(handlers[JOB_TYPES.LAPSED_GUEST_SCAN]).not.toHaveBeenCalled();
  });

  it("routes day-of-reminder to its dedicated handler", async () => {
    const handlers = makeHandlers();

    new JobWorker({ redisUrl: "redis://localhost:6379", handlers });

    const payload: DayOfReminderPayload = {
      reservationId: "res_456",
      guestPhone: null,
      guestEmail: "guest@example.com",
      venueId: "venue_xyz",
      channel: "email",
    };

    await mocks.workerProcess({ name: JOB_TYPES.DAY_OF_REMINDER, data: payload });

    expect(handlers[JOB_TYPES.DAY_OF_REMINDER]).toHaveBeenCalledOnce();
    expect(handlers[JOB_TYPES.DAY_OF_REMINDER]).toHaveBeenCalledWith(payload);
    expect(handlers[JOB_TYPES.BOOKING_REMINDER]).not.toHaveBeenCalled();
  });

  it("routes post-visit-followup to its dedicated handler", async () => {
    const handlers = makeHandlers();

    new JobWorker({ redisUrl: "redis://localhost:6379", handlers });

    const payload: PostVisitFollowupPayload = {
      reservationId: "res_789",
      guestId: "guest_1",
      guestEmail: "guest@example.com",
      guestPhone: null,
      venueId: "venue_xyz",
    };

    await mocks.workerProcess({ name: JOB_TYPES.POST_VISIT_FOLLOWUP, data: payload });

    expect(handlers[JOB_TYPES.POST_VISIT_FOLLOWUP]).toHaveBeenCalledOnce();
    expect(handlers[JOB_TYPES.POST_VISIT_FOLLOWUP]).toHaveBeenCalledWith(payload);
  });

  it("routes pre-arrival-briefing to its dedicated handler", async () => {
    const handlers = makeHandlers();

    new JobWorker({ redisUrl: "redis://localhost:6379", handlers });

    const payload: PreArrivalBriefingPayload = {
      reservationId: "res_abc",
      guestEmail: "guest@example.com",
      venueId: "venue_xyz",
    };

    await mocks.workerProcess({ name: JOB_TYPES.PRE_ARRIVAL_BRIEFING, data: payload });

    expect(handlers[JOB_TYPES.PRE_ARRIVAL_BRIEFING]).toHaveBeenCalledOnce();
    expect(handlers[JOB_TYPES.PRE_ARRIVAL_BRIEFING]).toHaveBeenCalledWith(payload);
  });

  it("routes lapsed-guest-scan to its dedicated handler", async () => {
    const handlers = makeHandlers();

    new JobWorker({ redisUrl: "redis://localhost:6379", handlers });

    const payload: LapsedGuestScanPayload = {
      venueId: "venue_xyz",
      lapsedAfterDays: 90,
    };

    await mocks.workerProcess({ name: JOB_TYPES.LAPSED_GUEST_SCAN, data: payload });

    expect(handlers[JOB_TYPES.LAPSED_GUEST_SCAN]).toHaveBeenCalledOnce();
    expect(handlers[JOB_TYPES.LAPSED_GUEST_SCAN]).toHaveBeenCalledWith(payload);
  });

  it("routes waitlist-expiry to its dedicated handler", async () => {
    const handlers = makeHandlers();

    new JobWorker({ redisUrl: "redis://localhost:6379", handlers });

    const payload: WaitlistExpiryPayload = {
      waitlistEntryId: "wl_1",
      guestPhone: null,
      guestEmail: "guest@example.com",
      venueId: "venue_xyz",
    };

    await mocks.workerProcess({ name: JOB_TYPES.WAITLIST_EXPIRY, data: payload });

    expect(handlers[JOB_TYPES.WAITLIST_EXPIRY]).toHaveBeenCalledOnce();
    expect(handlers[JOB_TYPES.WAITLIST_EXPIRY]).toHaveBeenCalledWith(payload);
  });

  it("each job type routes only to its own handler, not others", async () => {
    const handlers = makeHandlers();

    new JobWorker({ redisUrl: "redis://localhost:6379", handlers });

    await mocks.workerProcess({
      name: JOB_TYPES.WAITLIST_EXPIRY,
      data: { waitlistEntryId: "wl_2", guestPhone: null, guestEmail: null, venueId: "v1" },
    });

    expect(handlers[JOB_TYPES.WAITLIST_EXPIRY]).toHaveBeenCalledOnce();
    expect(handlers[JOB_TYPES.BOOKING_REMINDER]).not.toHaveBeenCalled();
    expect(handlers[JOB_TYPES.DAY_OF_REMINDER]).not.toHaveBeenCalled();
    expect(handlers[JOB_TYPES.POST_VISIT_FOLLOWUP]).not.toHaveBeenCalled();
    expect(handlers[JOB_TYPES.PRE_ARRIVAL_BRIEFING]).not.toHaveBeenCalled();
    expect(handlers[JOB_TYPES.LAPSED_GUEST_SCAN]).not.toHaveBeenCalled();
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
