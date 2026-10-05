import { describe, it, expect, vi } from "vitest";

vi.mock("../services/venue.js", () => ({
  venueService: {
    getById: vi.fn().mockResolvedValue({
      id: "venue-1",
      name: "The Oak Table",
      ianaTimezone: "America/Los_Angeles",
      settings: {},
    }),
  },
}));

import { createEffectsRecorder } from "./effects-harness.js";
import { createMockReservation } from "./mocks.js";
import type { Reservation } from "@mbe/types";

const reservation = createMockReservation({
  id: "res-1",
  venueId: "venue-1",
  startTime: "2099-01-01T18:00:00.000Z",
}) as unknown as Reservation;

describe("effects harness (smoke)", () => {
  it("records a live SSE event and ignores the derived table-status delta", () => {
    const rec = createEffectsRecorder();
    rec.appOptions.reservationEvents!.emitReservationCreated(reservation);
    rec.appOptions.reservationEvents!.emitTableStatusChanged("venue-1", [
      { tableId: "t1", status: "occupied" } as never,
    ]);
    expect(rec.effects.events).toEqual([{ type: "reservation:created", id: "res-1" }]);
  });

  it("records an outbound guest message at the dispatcher seam", async () => {
    const rec = createEffectsRecorder();
    await rec.appOptions.bookingNotifier!.scheduleBookingNotifications(reservation, "tok");
    expect(rec.effects.messages).toEqual([
      { kind: "booking-confirmation", reservationId: "res-1", guestEmail: "john@example.com" },
    ]);
  });

  it("records reminder job operations and keeps the scheduled-job store", async () => {
    const rec = createEffectsRecorder();
    await rec.appOptions.bookingNotifier!.scheduleBookingNotifications(reservation, "tok");
    expect(rec.effects.jobs.map((j) => j.op)).toEqual(["schedule", "schedule"]);
    expect([...rec.scheduledJobs.keys()].sort()).toEqual([
      "booking-reminder:res-1",
      "day-of-reminder:res-1",
    ]);
    await rec.appOptions.bookingNotifier!.cancelBookingReminders("res-1");
    expect(rec.scheduledJobs.size).toBe(0);
  });

  it("records a post-visit thank-you only when the notifier's own gates pass", async () => {
    const rec = createEffectsRecorder();
    const base = {
      reservationId: "res-1",
      guestId: null,
      guestEmail: "john@example.com",
      guestFirstName: "John",
      unsubscribed: false,
      venueName: "The Oak Table",
      visitDate: "2099-01-01",
      feedbackUrl: null,
    };
    await rec.appOptions.postVisitNotifier!.sendPostVisitEmail({
      ...base,
      venuePostVisitEmailEnabled: false,
    });
    await rec.appOptions.postVisitNotifier!.sendPostVisitEmail({
      ...base,
      venuePostVisitEmailEnabled: true,
    });
    expect(rec.effects.messages).toEqual([
      { kind: "post-visit-thank-you", guestEmail: "john@example.com" },
    ]);
  });

  it("records deposit operations through the recording deposit service", async () => {
    const rec = createEffectsRecorder();
    rec.deposits.seed({ id: "dep-1", status: "held" });
    await rec.deposits.service.getByReservationId("res-1");
    await rec.deposits.service.refund("dep-1");
    expect(rec.effects.depositOps).toEqual([{ op: "refund", args: ["dep-1"] }]);
  });
});
