import { describe, it, expect } from "vitest";
import { JOB_TYPES } from "./job-types.js";
import type { ReminderPayload, JobPayloadMap } from "./job-types.js";

// Compile-time assertions: both job types must use the exact same ReminderPayload shape.
// If JobPayloadMap[BOOKING_REMINDER] or JobPayloadMap[DAY_OF_REMINDER] diverge from
// ReminderPayload (or if ReminderPayload doesn't exist), pnpm typecheck fails here.
type _AssertBookingReminder =
  JobPayloadMap[typeof JOB_TYPES.BOOKING_REMINDER] extends ReminderPayload
    ? ReminderPayload extends JobPayloadMap[typeof JOB_TYPES.BOOKING_REMINDER]
      ? true
      : never
    : never;
type _AssertDayOfReminder = JobPayloadMap[typeof JOB_TYPES.DAY_OF_REMINDER] extends ReminderPayload
  ? ReminderPayload extends JobPayloadMap[typeof JOB_TYPES.DAY_OF_REMINDER]
    ? true
    : never
  : never;

const _booking: _AssertBookingReminder = true;
const _dayOf: _AssertDayOfReminder = true;

describe("ReminderPayload", () => {
  it("is the shared contract for BOOKING_REMINDER and DAY_OF_REMINDER", () => {
    const payload: ReminderPayload = {
      reservationId: "res_1",
      guestPhone: null,
      guestEmail: "a@b.com",
      venueId: "v_1",
      channel: "email",
    };
    expect(payload.reservationId).toBe("res_1");
    expect(payload.venueId).toBe("v_1");
    expect([JOB_TYPES.BOOKING_REMINDER, JOB_TYPES.DAY_OF_REMINDER]).toHaveLength(2);
  });
});
