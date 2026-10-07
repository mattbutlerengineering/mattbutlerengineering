import { describe, it, expect } from "vitest";
import { createEffectsRecorder } from "./effects-harness.js";
import { createMockReservation } from "./mocks.js";
import type { Reservation } from "@mbe/types";

const payload = { reservationId: "res-1", venueId: "venue-1" };

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

  it("records outbound guest messages at the dispatcher seam, flagging unknown sends", async () => {
    const rec = createEffectsRecorder();
    const port = rec.appOptions.notificationPort!;
    await port.sendBookingConfirmation({
      reservationId: "res-1",
      guestEmail: "john@example.com",
    } as never);
    await port.sendThankYouEmail({ guestEmail: "john@example.com" } as never);
    await (port as unknown as Record<string, (i: unknown) => Promise<void>>).sendSurprise!({});
    expect(rec.effects.messages).toEqual([
      { kind: "booking-confirmation", reservationId: "res-1", guestEmail: "john@example.com" },
      { kind: "post-visit-thank-you", guestEmail: "john@example.com" },
      { kind: "unexpected:sendSurprise" },
    ]);
  });

  it("records reminder job operations, keeps the store, and reports removals", async () => {
    const rec = createEffectsRecorder();
    const jobs = rec.appOptions.jobs!;
    await jobs.schedule("booking-reminder", payload, 5, "booking-reminder:res-1");
    expect(rec.scheduledJobs.get("booking-reminder:res-1")).toEqual({
      jobType: "booking-reminder",
      delayMs: 5,
      payload,
    });
    expect(await jobs.cancel("booking-reminder:res-1")).toBe(true);
    expect(await jobs.cancel("booking-reminder:res-1")).toBe(false);
    expect(rec.effects.jobs.map((j) => j.op)).toEqual(["schedule", "cancel", "cancel"]);
    rec.seedReminders("res-1", "venue-1");
    expect([...rec.scheduledJobs.keys()].sort()).toEqual([
      "booking-reminder:res-1",
      "day-of-reminder:res-1",
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
