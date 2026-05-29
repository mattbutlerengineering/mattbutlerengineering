import { describe, it, expect, vi, beforeEach } from "vitest";
import { JobWorker } from "./worker.js";
import { JobType } from "./job-types.js";
import type { JobHandlerMap, JobPayloadMap } from "./worker.js";

describe("JobWorker with JobHandlerMap", () => {
  const makeHandlers = (): {
    [K in JobType]: ReturnType<typeof vi.fn>;
  } & JobHandlerMap => ({
    [JobType.BOOKING_REMINDER]: vi.fn().mockResolvedValue(undefined),
    [JobType.DAY_OF_REMINDER]: vi.fn().mockResolvedValue(undefined),
    [JobType.POST_VISIT_FOLLOWUP]: vi.fn().mockResolvedValue(undefined),
    [JobType.PRE_ARRIVAL_BRIEFING]: vi.fn().mockResolvedValue(undefined),
    [JobType.LAPSED_GUEST_SCAN]: vi.fn().mockResolvedValue(undefined),
    [JobType.WAITLIST_EXPIRY]: vi.fn().mockResolvedValue(undefined),
  });

  let handlers: ReturnType<typeof makeHandlers>;
  let worker: JobWorker;

  beforeEach(() => {
    handlers = makeHandlers();
    worker = new JobWorker(handlers);
  });

  it("routes BOOKING_REMINDER to its handler with typed payload", async () => {
    const payload: JobPayloadMap[JobType.BOOKING_REMINDER] = {
      reservationId: "res-1",
      guestEmail: "guest@example.com",
    };
    await worker.handle(JobType.BOOKING_REMINDER, payload);
    expect(handlers[JobType.BOOKING_REMINDER]).toHaveBeenCalledWith(payload);
    expect(handlers[JobType.DAY_OF_REMINDER]).not.toHaveBeenCalled();
    expect(handlers[JobType.POST_VISIT_FOLLOWUP]).not.toHaveBeenCalled();
    expect(handlers[JobType.PRE_ARRIVAL_BRIEFING]).not.toHaveBeenCalled();
    expect(handlers[JobType.LAPSED_GUEST_SCAN]).not.toHaveBeenCalled();
    expect(handlers[JobType.WAITLIST_EXPIRY]).not.toHaveBeenCalled();
  });

  it("routes DAY_OF_REMINDER to its handler with typed payload", async () => {
    const payload: JobPayloadMap[JobType.DAY_OF_REMINDER] = {
      reservationId: "res-2",
      guestEmail: "guest@example.com",
    };
    await worker.handle(JobType.DAY_OF_REMINDER, payload);
    expect(handlers[JobType.DAY_OF_REMINDER]).toHaveBeenCalledWith(payload);
    expect(handlers[JobType.BOOKING_REMINDER]).not.toHaveBeenCalled();
  });

  it("routes POST_VISIT_FOLLOWUP to its handler with typed payload", async () => {
    const payload: JobPayloadMap[JobType.POST_VISIT_FOLLOWUP] = {
      reservationId: "res-3",
      guestEmail: "guest@example.com",
    };
    await worker.handle(JobType.POST_VISIT_FOLLOWUP, payload);
    expect(handlers[JobType.POST_VISIT_FOLLOWUP]).toHaveBeenCalledWith(payload);
    expect(handlers[JobType.BOOKING_REMINDER]).not.toHaveBeenCalled();
  });

  it("routes PRE_ARRIVAL_BRIEFING to its handler with typed payload", async () => {
    const payload: JobPayloadMap[JobType.PRE_ARRIVAL_BRIEFING] = {
      reservationId: "res-4",
      guestEmail: "guest@example.com",
    };
    await worker.handle(JobType.PRE_ARRIVAL_BRIEFING, payload);
    expect(handlers[JobType.PRE_ARRIVAL_BRIEFING]).toHaveBeenCalledWith(payload);
    expect(handlers[JobType.BOOKING_REMINDER]).not.toHaveBeenCalled();
  });

  it("routes LAPSED_GUEST_SCAN to its handler with typed payload", async () => {
    const payload: JobPayloadMap[JobType.LAPSED_GUEST_SCAN] = {
      guestId: "guest-1",
    };
    await worker.handle(JobType.LAPSED_GUEST_SCAN, payload);
    expect(handlers[JobType.LAPSED_GUEST_SCAN]).toHaveBeenCalledWith(payload);
    expect(handlers[JobType.BOOKING_REMINDER]).not.toHaveBeenCalled();
  });

  it("routes WAITLIST_EXPIRY to its handler with typed payload", async () => {
    const payload: JobPayloadMap[JobType.WAITLIST_EXPIRY] = {
      waitlistId: "wl-1",
    };
    await worker.handle(JobType.WAITLIST_EXPIRY, payload);
    expect(handlers[JobType.WAITLIST_EXPIRY]).toHaveBeenCalledWith(payload);
    expect(handlers[JobType.BOOKING_REMINDER]).not.toHaveBeenCalled();
  });

  it("calls only the matching handler when multiple jobs fire sequentially", async () => {
    await worker.handle(JobType.BOOKING_REMINDER, {
      reservationId: "r1",
      guestEmail: "a@b.com",
    });
    await worker.handle(JobType.WAITLIST_EXPIRY, { waitlistId: "w1" });

    expect(handlers[JobType.BOOKING_REMINDER]).toHaveBeenCalledTimes(1);
    expect(handlers[JobType.WAITLIST_EXPIRY]).toHaveBeenCalledTimes(1);
    expect(handlers[JobType.DAY_OF_REMINDER]).not.toHaveBeenCalled();
    expect(handlers[JobType.POST_VISIT_FOLLOWUP]).not.toHaveBeenCalled();
    expect(handlers[JobType.PRE_ARRIVAL_BRIEFING]).not.toHaveBeenCalled();
    expect(handlers[JobType.LAPSED_GUEST_SCAN]).not.toHaveBeenCalled();
  });
});
