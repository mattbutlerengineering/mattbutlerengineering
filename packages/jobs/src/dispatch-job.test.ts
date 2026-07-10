import { describe, it, expect, vi } from "vitest";
import { dispatchJob, UnknownJobTypeError } from "./dispatch-job.js";
import { JOB_TYPES } from "./job-types.js";
import type { JobHandlerMap } from "./worker.js";
import type { ReminderPayload, LapsedGuestScanPayload } from "./job-types.js";

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

describe("dispatchJob", () => {
  it("routes a known job name to its handler with the correct payload", async () => {
    const handlers = makeHandlers();
    const payload: ReminderPayload = {
      reservationId: "res_1",
      venueId: "venue_1",
    };

    await dispatchJob(handlers, { name: JOB_TYPES.BOOKING_REMINDER, data: payload });

    expect(handlers[JOB_TYPES.BOOKING_REMINDER]).toHaveBeenCalledOnce();
    expect(handlers[JOB_TYPES.BOOKING_REMINDER]).toHaveBeenCalledWith(payload);
  });

  it("only calls the matched handler, not others", async () => {
    const handlers = makeHandlers();
    const payload: LapsedGuestScanPayload = { venueId: "venue_1", lapsedAfterDays: 90 };

    await dispatchJob(handlers, { name: JOB_TYPES.LAPSED_GUEST_SCAN, data: payload });

    expect(handlers[JOB_TYPES.LAPSED_GUEST_SCAN]).toHaveBeenCalledOnce();
    expect(handlers[JOB_TYPES.BOOKING_REMINDER]).not.toHaveBeenCalled();
    expect(handlers[JOB_TYPES.DAY_OF_REMINDER]).not.toHaveBeenCalled();
    expect(handlers[JOB_TYPES.POST_VISIT_FOLLOWUP]).not.toHaveBeenCalled();
    expect(handlers[JOB_TYPES.PRE_ARRIVAL_BRIEFING]).not.toHaveBeenCalled();
    expect(handlers[JOB_TYPES.WAITLIST_EXPIRY]).not.toHaveBeenCalled();
  });

  it("throws UnknownJobTypeError for an unrecognised job name", async () => {
    const handlers = makeHandlers();

    await expect(dispatchJob(handlers, { name: "totally-unknown-job", data: {} })).rejects.toThrow(
      UnknownJobTypeError
    );
  });

  it("UnknownJobTypeError includes the unknown job name in its message", async () => {
    const handlers = makeHandlers();

    await expect(dispatchJob(handlers, { name: "ghost-job", data: {} })).rejects.toThrow(
      "ghost-job"
    );
  });

  it("throws UnknownJobTypeError for a known job type with no registered handler in a partial map", async () => {
    const handlers: JobHandlerMap = {
      [JOB_TYPES.BOOKING_REMINDER]: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      dispatchJob(handlers, { name: JOB_TYPES.LAPSED_GUEST_SCAN, data: {} })
    ).rejects.toThrow(UnknownJobTypeError);
  });

  it("no-handler UnknownJobTypeError message names the job type and is distinguishable from an unrecognised name", async () => {
    const handlers: JobHandlerMap = {};

    await expect(
      dispatchJob(handlers, { name: JOB_TYPES.WAITLIST_EXPIRY, data: {} })
    ).rejects.toThrow(/no handler registered.*waitlist-expiry/i);
  });
});
