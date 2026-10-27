import { describe, expect, it, vi } from "vitest";
import type { AvailabilityConfig, DateRule, Reservation } from "@mbe/types";
import type { BookingSnapshot } from "@mbe/availability";
import { rebookOfferId } from "@mbe/availability";
import { loadVenueCancellation } from "./manage-rebook.js";

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

const closedAlways: DateRule = {
  id: "c",
  kind: "closure",
  targetKind: "venue",
  startsOn: "2026-11-01",
  endsOn: "2026-12-31",
};

const snapshot = (dateRules: DateRule[] = []): BookingSnapshot => ({
  timezone: TZ,
  config: { ...CONFIG, dateRules },
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
});

const reservation = (overrides: Partial<Reservation> = {}): Reservation =>
  ({
    id: "res_1",
    date: "2026-11-06",
    startTime: "2026-11-07T01:30:00.000Z", // 17:30 PST on Nov 6
    endTime: "2026-11-07T03:30:00.000Z",
    partySize: 2,
    status: "CANCELLED",
    ...overrides,
  }) as Reservation;

type Outcome = {
  refund: string;
  rebookedReservationId?: string | null;
  guestMessage?: string | null;
};

const deps = (outcome: Outcome | null, snap = snapshot(), depositRequired = false) => ({
  findCancelOutcome: vi
    .fn()
    .mockResolvedValue(
      outcome && { id: "co_1", rebookedReservationId: null, guestMessage: null, ...outcome }
    ),
  findRebooked: vi.fn().mockResolvedValue({
    id: "res_2",
    startTime: new Date("2026-11-08T02:00:00.000Z"),
  }),
  requiresDeposit: vi.fn().mockResolvedValue(depositRequired),
  loadSnapshot: vi.fn().mockResolvedValue({ snapshot: snap }),
});

describe("loadVenueCancellation", () => {
  it("is null for a booking the venue did not cancel, without loading a snapshot", async () => {
    const d = deps(null);
    expect(await loadVenueCancellation(reservation(), "v1", NOW, d)).toBeNull();
    expect(d.loadSnapshot).not.toHaveBeenCalled();
  });

  it("is null while the reservation is not cancelled, without querying outcomes", async () => {
    const d = deps({ refund: "none" });
    expect(
      await loadVenueCancellation(reservation({ status: "CONFIRMED" }), "v1", NOW, d)
    ).toBeNull();
    expect(d.findCancelOutcome).not.toHaveBeenCalled();
  });

  it("returns the refund status and up to 3 offers keyed by their start instant", async () => {
    const result = await loadVenueCancellation(reservation(), "v1", NOW, deps({ refund: "done" }));
    expect(result?.refundStatus).toBe("done");
    expect(result?.offers).toHaveLength(3);
    for (const offer of result?.offers ?? []) {
      expect(offer.id).toBe(rebookOfferId(new Date(offer.startTime)));
      expect(offer.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("offers only slots inside the venue's booking window", async () => {
    // NOW is 04:00 PST Nov 5; minAdvance 48h puts the earliest offer after 04:00 PST Nov 7,
    // and maxAdvance 3 days ends the window with Nov 8 (local).
    const d = deps({ refund: "done" });
    d.loadSnapshot.mockResolvedValue({
      snapshot: snapshot(),
      venueSettings: { minAdvanceBooking: 48, maxAdvanceBooking: 3 },
    });
    const result = await loadVenueCancellation(reservation(), "v1", NOW, d);
    expect(result?.offers.length).toBeGreaterThan(0);
    for (const offer of result?.offers ?? []) {
      const start = new Date(offer.startTime);
      expect(start.getTime()).toBeGreaterThanOrEqual(NOW.getTime() + 48 * 3600_000);
      expect(offer.date <= "2026-11-08").toBe(true);
    }
  });

  it("carries the closure's service date and the venue's guest message", async () => {
    const outcome = { refund: "done", guestMessage: "Closed for a private event" };
    const result = await loadVenueCancellation(reservation(), "v1", NOW, deps(outcome));
    expect(result?.closureDate).toBe("2026-11-06");
    expect(result?.closureMessage).toBe("Closed for a private event");
  });

  it("returns no offers when nothing qualifies, so the page shows only the picker link", async () => {
    const result = await loadVenueCancellation(
      reservation(),
      "v1",
      NOW,
      deps({ refund: "pending" }, snapshot([closedAlways]))
    );
    expect(result).toEqual({
      refundStatus: "pending",
      closureDate: "2026-11-06",
      closureMessage: null,
      offers: [],
      rebooked: null,
    });
  });

  it("reports a rebooked state with no offers once the guest has rebooked", async () => {
    const d = deps({ refund: "done", rebookedReservationId: "res_2" });
    const result = await loadVenueCancellation(reservation(), "v1", NOW, d);
    expect(result).toEqual({
      refundStatus: "done",
      closureDate: "2026-11-06",
      closureMessage: null,
      offers: [],
      rebooked: { reservationId: "res_2", startTime: "2026-11-08T02:00:00.000Z" },
    });
    expect(d.loadSnapshot).not.toHaveBeenCalled();
  });

  it("offers nothing where the new booking would need a deposit, leaving the full widget flow", async () => {
    const d = deps({ refund: "done" }, snapshot(), true);
    const result = await loadVenueCancellation(reservation(), "v1", NOW, d);
    expect(result).toEqual({
      refundStatus: "done",
      closureDate: "2026-11-06",
      closureMessage: null,
      offers: [],
      rebooked: null,
    });
    expect(d.loadSnapshot).not.toHaveBeenCalled();
  });
});
