import { describe, expect, it, vi } from "vitest";
import type { AvailabilityConfig, Reservation } from "@mbe/types";
import type { BookingSnapshot } from "@mbe/availability";
import { rebookOfferId } from "@mbe/availability";
import { loadVenueCancellation, rebookVenueCancelled, type RebookDeps } from "./manage-rebook.js";

vi.mock("./database.js", () => ({ prisma: {} }));

const TZ = "America/Los_Angeles";
const NOW = new Date("2026-11-05T12:00:00Z");

const CONFIG: AvailabilityConfig = {
  schedules: [{ id: "regular", name: "Regular", kind: "regular", isRegular: true }],
  venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
  scheduleServices: [
    {
      id: "dinner",
      scheduleId: "regular",
      venueServiceId: "vs-dinner",
      opensAt: 1020,
      lastSeatingAt: 1080,
      closesAt: 1200,
      seating: { version: 1, interval: 30 },
      bookingTypes: ["online", "phone"],
    },
  ],
  assignments: [
    { id: "as", scheduleId: "regular", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
  ],
  dateRules: [],
};

const snapshot: BookingSnapshot = {
  timezone: TZ,
  config: CONFIG,
  tables: [
    {
      id: "t4",
      name: "4-top",
      capacity: 4,
      minCovers: 1,
      maxCovers: 4,
      isActive: true,
      priority: 1,
    },
  ],
  reservations: [],
  holds: [],
  settings: null,
};

const original = {
  id: "res_1",
  date: "2026-11-06",
  startTime: "2026-11-07T01:30:00.000Z",
  partySize: 2,
  status: "CANCELLED",
  guestName: "Jane Doe",
  guestEmail: "jane@example.com",
  guestPhone: "+15550001111",
  guestId: "guest_1",
} as unknown as Reservation;

const newReservation = { id: "res_2" } as unknown as Reservation;

function makeDeps(overrides: Partial<RebookDeps> = {}): RebookDeps {
  return {
    findCancelOutcome: vi
      .fn()
      .mockResolvedValue({ id: "co_1", refund: "done", rebookedReservationId: null }),
    findRebooked: vi.fn(),
    requiresDeposit: vi.fn().mockResolvedValue(false),
    loadSnapshot: vi.fn().mockResolvedValue({ snapshot }),
    createHold: vi.fn().mockResolvedValue({ success: true, hold: { id: "hold_1" } }),
    confirmHold: vi.fn().mockResolvedValue({ success: true, reservation: newReservation }),
    releaseHold: vi.fn().mockResolvedValue(true),
    linkOutcome: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

/** A currently offered slot, read the way the manage page reads it. */
async function firstOffer(deps: RebookDeps): Promise<{ id: string; date: string }> {
  const result = await loadVenueCancellation(original, "v1", NOW, deps);
  const offer = result?.offers[0];
  if (!offer) throw new Error("expected an offer");
  return offer;
}

describe("rebookVenueCancelled", () => {
  it("books the offered slot with the original guest's name, email and phone, and links the outcome", async () => {
    const deps = makeDeps();
    const offer = await firstOffer(deps);

    const result = await rebookVenueCancelled(original, "v1", offer.id, NOW, deps);

    expect(result).toEqual({ ok: true, reservation: newReservation });
    expect(deps.createHold).toHaveBeenCalledWith(
      expect.objectContaining({
        venueId: "v1",
        date: offer.date,
        time: offer.id,
        partySize: 2,
      }),
      expect.any(String)
    );
    const input = vi.mocked(deps.confirmHold).mock.calls[0]![0];
    expect(input.holdId).toBe("hold_1");
    expect(input.venueId).toBe("v1");
    expect(input.guestDetails).toMatchObject({
      guestName: "Jane Doe",
      guestEmail: "jane@example.com",
      guestPhone: "+15550001111",
      guestId: "guest_1",
    });
    // The link rides the confirm transaction.
    const tx = {} as never;
    await input.inTransaction!(tx, "res_2");
    expect(deps.linkOutcome).toHaveBeenCalledWith(tx, "co_1", "res_2");
  });

  it("refuses with deposit-required where the new booking would need a deposit, booking nothing", async () => {
    const deps = makeDeps({ requiresDeposit: vi.fn().mockResolvedValue(true) });
    const result = await rebookVenueCancelled(
      original,
      "v1",
      rebookOfferId(new Date("2026-11-06T02:00:00Z")),
      NOW,
      deps
    );
    expect(result).toEqual({ ok: false, reason: "deposit-required" });
    expect(deps.createHold).not.toHaveBeenCalled();
  });

  it("refuses with already-rebooked once the outcome is linked", async () => {
    const deps = makeDeps({
      findCancelOutcome: vi
        .fn()
        .mockResolvedValue({ id: "co_1", refund: "done", rebookedReservationId: "res_2" }),
    });
    const result = await rebookVenueCancelled(original, "v1", "x", NOW, deps);
    expect(result).toEqual({ ok: false, reason: "already-rebooked" });
    expect(deps.createHold).not.toHaveBeenCalled();
  });

  it("refuses a booking the venue did not cancel", async () => {
    const deps = makeDeps({ findCancelOutcome: vi.fn().mockResolvedValue(null) });
    const result = await rebookVenueCancelled(original, "v1", "x", NOW, deps);
    expect(result).toEqual({ ok: false, reason: "not-rebookable" });
  });

  it("refuses an offer that is not currently offered", async () => {
    const deps = makeDeps();
    const result = await rebookVenueCancelled(
      original,
      "v1",
      "2026-11-06T00:00:00.000Z",
      NOW,
      deps
    );
    expect(result).toEqual({ ok: false, reason: "offer-unavailable" });
    expect(deps.createHold).not.toHaveBeenCalled();
  });

  it("reports the booking gate's refusal when the hold is refused", async () => {
    const rejection = { code: "closed", message: "closed" };
    const deps = makeDeps({
      createHold: vi.fn().mockResolvedValue({ success: false, error: "no", rejection }),
    });
    const offer = await firstOffer(deps);
    const result = await rebookVenueCancelled(original, "v1", offer.id, NOW, deps);
    expect(result).toEqual({ ok: false, reason: "rejected", rejection });
  });

  it("reports a taken slot when no hold can be made", async () => {
    const deps = makeDeps({
      createHold: vi.fn().mockResolvedValue({ success: false, error: "taken" }),
    });
    const offer = await firstOffer(deps);
    const result = await rebookVenueCancelled(original, "v1", offer.id, NOW, deps);
    expect(result).toEqual({ ok: false, reason: "slot-taken" });
  });

  it("answers already-rebooked and releases the hold when a concurrent rebook won the link", async () => {
    const deps = makeDeps({ linkOutcome: vi.fn().mockResolvedValue(false) });
    // The confirm transaction rolls back when the link hook throws.
    vi.mocked(deps.confirmHold).mockImplementation(async (input) => {
      await input.inTransaction!({} as never, "res_2");
      return { success: true, reservation: newReservation };
    });
    const offer = await firstOffer(deps);
    const result = await rebookVenueCancelled(original, "v1", offer.id, NOW, deps);
    expect(result).toEqual({ ok: false, reason: "already-rebooked" });
    expect(deps.releaseHold).toHaveBeenCalledWith("hold_1", expect.any(String));
  });

  it("reports a taken slot when confirming fails on a conflict", async () => {
    const deps = makeDeps({
      confirmHold: vi
        .fn()
        .mockResolvedValue({ success: false, error: "gone", errorCode: "CONFLICT" }),
    });
    const offer = await firstOffer(deps);
    const result = await rebookVenueCancelled(original, "v1", offer.id, NOW, deps);
    expect(result).toEqual({ ok: false, reason: "slot-taken" });
  });
});
