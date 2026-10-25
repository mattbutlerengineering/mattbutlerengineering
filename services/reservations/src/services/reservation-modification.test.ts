import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Reservation } from "@mbe/types";

vi.mock("./reservation.js", () => ({
  reservationService: {
    updateWithConflictCheck: vi.fn(),
  },
}));

vi.mock("./database.js", () => ({
  prisma: { reservationHold: { findUnique: vi.fn() } },
}));

vi.mock("./move-to-hold.js", () => ({
  moveReservationToHold: vi.fn(),
}));

vi.mock("./venue.js", () => ({
  venueService: {
    getById: vi.fn(),
    getPolicyById: vi.fn(),
  },
}));

import { reservationService } from "./reservation.js";
import { venueService } from "./venue.js";
import { prisma } from "./database.js";
import { moveReservationToHold } from "./move-to-hold.js";
import type { VenuePolicy } from "./venue.js";
import type { DepositService } from "./deposit.js";
import { modifyReservation, type ReservationChanges } from "./reservation-modification.js";

/** The injected DepositService fake. */
const depositService = { getByReservationId: vi.fn() };
const deposits = depositService as unknown as DepositService;

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res_1",
    date: "2026-06-15",
    startTime: "19:00",
    endTime: "21:00",
    partySize: 4,
    status: "PENDING",
    notes: "Window seat please",
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Jane Doe",
    guestEmail: "jane@example.com",
    guestPhone: "+1555000111",
    guestId: null,
    userId: null,
    occasion: null,
    seatingPreference: null,
    tableId: "table_1",
    guest: { visitCount: 3, communicationPreference: "email_only" },
    venueId: "venue_1",
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

function makeVenuePolicy(overrides: Partial<VenuePolicy> = {}): VenuePolicy {
  return {
    id: "venue_1",
    slug: "the-oak-table",
    currencyCode: "USD",
    depositEnabled: true,
    depositType: "flat",
    depositAmountCents: 2500,
    freeCancellationHours: null,
    lateCancellationFeePercent: null,
    noShowFeePercent: null,
    ...overrides,
  };
}

const SESSION_ID = "sess_1";
const iso0 = (): string => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const FAR_START = (): Date => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

/**
 * Calls modifyReservation for a change onto a held slot: the hold carries the
 * time and party size the change asks for (the reservation's own otherwise),
 * and is what the service loads from the database.
 */
async function modifyHeld(
  reservation: Reservation,
  changes: ReservationChanges,
  holdOverrides: Record<string, unknown> = {}
) {
  const start = changes.startTime ? new Date(changes.startTime) : FAR_START();
  vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce({
    id: "hold_1",
    venueId: reservation.venueId,
    sessionId: SESSION_ID,
    date: start,
    startTime: start,
    endTime: new Date(start.getTime() + 2 * 60 * 60 * 1000),
    partySize: changes.partySize ?? reservation.partySize,
    ...holdOverrides,
  } as never);
  return modifyReservation(reservation, changes, deposits, {
    holdId: "hold_1",
    sessionId: SESSION_ID,
  });
}

describe("modifyReservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns NO_CHANGES_PROVIDED when no fields are provided", async () => {
    const reservation = makeReservation();

    const result = await modifyReservation(reservation, {}, deposits);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(400);
      expect(result.code).toBe("NO_CHANGES_PROVIDED");
    }
    expect(reservationService.updateWithConflictCheck).not.toHaveBeenCalled();
  });

  it("returns HOLD_REQUIRED (400) for a time or party-size change without a hold", async () => {
    for (const changes of [{ startTime: iso0() }, { date: "2026-06-16" }, { partySize: 6 }]) {
      const result = await modifyReservation(makeReservation(), changes, deposits);

      expect(result).toMatchObject({ success: false, status: 400, code: "HOLD_REQUIRED" });
    }
    expect(moveReservationToHold).not.toHaveBeenCalled();
    expect(reservationService.updateWithConflictCheck).not.toHaveBeenCalled();
  });

  it.each([
    ["NOT_FOUND", 404, "HOLD_NOT_FOUND"],
    ["SESSION_MISMATCH", 403, "HOLD_SESSION_MISMATCH"],
    ["EXPIRED", 410, "HOLD_EXPIRED"],
    ["CONFLICT", 409, "SLOT_UNAVAILABLE"],
    ["PACING_EXCEEDED", 422, "PACING_EXCEEDED"],
  ] as const)("maps a %s move failure to %i %s", async (errorCode, status, code) => {
    vi.mocked(moveReservationToHold).mockResolvedValueOnce({
      success: false,
      error: "nope",
      errorCode,
    });

    const result = await modifyHeld(makeReservation(), { startTime: iso0() });

    expect(result).toMatchObject({ success: false, status, code });
  });

  it("carries the availability gate's rejection on a NOT_BOOKABLE move failure", async () => {
    const rejection = { code: "outside-availability", reason: "closed" } as const;
    vi.mocked(moveReservationToHold).mockResolvedValueOnce({
      success: false,
      error: "closed",
      errorCode: "NOT_BOOKABLE",
      rejection,
    });

    const result = await modifyHeld(makeReservation(), { startTime: iso0() });

    expect(result).toMatchObject({ success: false, status: 422, rejection });
  });

  it("returns HOLD_NOT_FOUND (404) without moving when the hold is missing or from another venue", async () => {
    vi.mocked(prisma.reservationHold.findUnique).mockResolvedValueOnce(null);
    const missing = await modifyReservation(makeReservation(), { partySize: 2 }, deposits, {
      holdId: "hold_x",
      sessionId: SESSION_ID,
    });
    expect(missing).toMatchObject({ success: false, status: 404, code: "HOLD_NOT_FOUND" });

    const foreign = await modifyHeld(makeReservation(), { partySize: 2 }, { venueId: "venue_2" });
    expect(foreign).toMatchObject({ success: false, status: 404, code: "HOLD_NOT_FOUND" });
    expect(moveReservationToHold).not.toHaveBeenCalled();
  });

  it("returns 403 without moving when another session owns the hold", async () => {
    const result = await modifyHeld(makeReservation(), { partySize: 2 }, { sessionId: "other" });

    expect(result).toMatchObject({ success: false, status: 403 });
    expect(moveReservationToHold).not.toHaveBeenCalled();
  });

  it("moves onto the hold, carrying specialRequests into the same write", async () => {
    const reservation = makeReservation();
    vi.mocked(moveReservationToHold).mockResolvedValueOnce({
      success: true,
      reservation: { ...reservation, partySize: 6 },
    });

    const result = await modifyHeld(reservation, { partySize: 6, specialRequests: "quiet" });

    expect(result.success).toBe(true);
    expect(moveReservationToHold).toHaveBeenCalledWith({
      reservation,
      holdId: "hold_1",
      sessionId: SESSION_ID,
      venueId: "venue_1",
      notes: "quiet",
    });
    expect(reservationService.updateWithConflictCheck).not.toHaveBeenCalled();
  });

  it("maps changes onto the update payload (specialRequests -> notes)", async () => {
    const reservation = makeReservation();
    const updated = { ...reservation, notes: "No peanuts please" };
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: true,
      reservation: updated,
    } as never);

    await modifyReservation(reservation, { specialRequests: "No peanuts please" }, deposits);

    expect(reservationService.updateWithConflictCheck).toHaveBeenCalledWith(
      "res_1",
      { notes: "No peanuts please" },
      undefined
    );
  });

  it("forwards the actor to the conflict-checked update", async () => {
    const reservation = makeReservation();
    const actor = { type: "guest", id: "guest_1" } as const;
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: true,
      reservation,
    } as never);

    await modifyReservation(reservation, { specialRequests: "quiet" }, deposits, undefined, actor);

    expect(reservationService.updateWithConflictCheck).toHaveBeenCalledWith(
      "res_1",
      { notes: "quiet" },
      actor
    );
  });

  it("updates partySize when there is no held/pending deposit at all", async () => {
    const reservation = makeReservation({ partySize: 4 });
    const updated = { ...reservation, partySize: 10 };
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(
      makeVenuePolicy({ depositType: "per_person" })
    );
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(null);
    vi.mocked(moveReservationToHold).mockResolvedValueOnce({
      success: true,
      reservation: updated,
    } as never);

    const result = await modifyHeld(reservation, { partySize: 10 });

    expect(result.success).toBe(true);
    expect(moveReservationToHold).toHaveBeenCalled();
  });
});

describe("booking window on guest modify (#6560)", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const iso = (offsetDays: number): string =>
    new Date(Date.now() + offsetDays * DAY_MS).toISOString();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(venueService.getById).mockResolvedValue({
      id: "venue_1",
      ianaTimezone: "UTC",
      settings: { minAdvanceBooking: 2, maxAdvanceBooking: 30 },
    } as never);
  });

  it("rejects a move into the past with 422 BOOKING_WINDOW_VIOLATION", async () => {
    const result = await modifyHeld(makeReservation(), { startTime: iso(-1) });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(422);
      expect(result.code).toBe("BOOKING_WINDOW_VIOLATION");
    }
    expect(moveReservationToHold).not.toHaveBeenCalled();
  });

  it("rejects a move past maxAdvanceBooking", async () => {
    const result = await modifyHeld(makeReservation(), { startTime: iso(60) });

    expect(result.success).toBe(false);
    expect(moveReservationToHold).not.toHaveBeenCalled();
  });

  it("allows a move inside the window", async () => {
    vi.mocked(moveReservationToHold).mockResolvedValueOnce({
      success: true,
      reservation: makeReservation(),
    } as never);

    const result = await modifyHeld(makeReservation(), { startTime: iso(7) });

    expect(result.success).toBe(true);
    expect(moveReservationToHold).toHaveBeenCalled();
  });

  it("does not consult the venue for a change that does not move the start", async () => {
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: true,
      reservation: makeReservation(),
    } as never);

    await modifyReservation(makeReservation(), { specialRequests: "quiet table" }, deposits);

    expect(venueService.getById).not.toHaveBeenCalled();
  });
});

describe("guest modification policy on modify", () => {
  const HOUR_MS = 60 * 60 * 1000;
  const startIn = (hours: number): string => new Date(Date.now() + hours * HOUR_MS).toISOString();

  function mockVenueSettings(settings: Record<string, unknown>): void {
    vi.mocked(venueService.getById).mockResolvedValue({
      id: "venue_1",
      ianaTimezone: "UTC",
      settings,
    } as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(moveReservationToHold).mockResolvedValue({
      success: true,
      reservation: makeReservation(),
    } as never);
  });

  it("rejects a time change inside the cutoff with 422 MODIFICATION_CUTOFF", async () => {
    mockVenueSettings({ guestModificationCutoffHours: 24 });
    const reservation = makeReservation({ startTime: startIn(23) });

    const result = await modifyHeld(reservation, { startTime: startIn(72) });

    expect(result).toMatchObject({ success: false, status: 422, code: "MODIFICATION_CUTOFF" });
    expect(moveReservationToHold).not.toHaveBeenCalled();
  });

  it("rejects a party-size change inside the cutoff", async () => {
    mockVenueSettings({ guestModificationCutoffHours: 24 });
    const reservation = makeReservation({ startTime: startIn(23) });

    const result = await modifyHeld(reservation, { partySize: 5 });

    expect(result).toMatchObject({ success: false, status: 422, code: "MODIFICATION_CUTOFF" });
  });

  it("still allows a specialRequests-only edit inside the cutoff", async () => {
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValue({
      success: true,
      reservation: makeReservation(),
    } as never);
    mockVenueSettings({ guestModificationCutoffHours: 24 });
    const reservation = makeReservation({ startTime: startIn(23) });

    const result = await modifyReservation(reservation, { specialRequests: "quiet" }, deposits);

    expect(result.success).toBe(true);
  });

  it("rejects a party-size change beyond guestMaxPartySizeChange", async () => {
    mockVenueSettings({ guestMaxPartySizeChange: 2 });
    const reservation = makeReservation({ startTime: startIn(72), partySize: 4 });

    const tooBig = await modifyHeld(reservation, { partySize: 7 });
    expect(tooBig).toMatchObject({
      success: false,
      status: 422,
      code: "PARTY_SIZE_CHANGE_TOO_LARGE",
    });
    expect(moveReservationToHold).not.toHaveBeenCalled();

    const ok = await modifyHeld(reservation, { partySize: 6 });
    expect(ok.success).toBe(true);
  });

  it("changes nothing when the policy settings are unset", async () => {
    mockVenueSettings({});
    const reservation = makeReservation({ startTime: startIn(1), partySize: 2 });

    const result = await modifyHeld(reservation, { partySize: 12 });

    expect(result.success).toBe(true);
  });
});

describe("per-person deposit guard on partySize change (#2931 — decision: Block)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks a partySize INCREASE with 409 when a per_person deposit is held", async () => {
    const reservation = makeReservation({ partySize: 4 });
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(
      makeVenuePolicy({ depositType: "per_person" })
    );
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce({
      status: "held",
    } as never);

    const result = await modifyHeld(reservation, { partySize: 6 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(409);
      expect(result.code).toBe("PARTY_SIZE_DEPOSIT_HELD");
      expect(result.detail).toMatch(/cancel/i);
    }
    expect(moveReservationToHold).not.toHaveBeenCalled();
  });

  it("blocks a partySize DECREASE with 409 when a per_person deposit is held", async () => {
    const reservation = makeReservation({ partySize: 6 });
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(
      makeVenuePolicy({ depositType: "per_person" })
    );
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce({
      status: "held",
    } as never);

    const result = await modifyHeld(reservation, { partySize: 4 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(409);
      expect(result.code).toBe("PARTY_SIZE_DEPOSIT_HELD");
    }
    expect(moveReservationToHold).not.toHaveBeenCalled();
  });

  it("blocks when the per_person deposit is still pending (not yet held)", async () => {
    const reservation = makeReservation({ partySize: 4 });
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(
      makeVenuePolicy({ depositType: "per_person" })
    );
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce({
      status: "pending",
    } as never);

    const result = await modifyHeld(reservation, { partySize: 8 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(409);
      expect(result.code).toBe("PARTY_SIZE_DEPOSIT_HELD");
    }
  });

  it("passes through on a flat-deposit venue even with a held deposit", async () => {
    const reservation = makeReservation({ partySize: 4 });
    const updated = { ...reservation, partySize: 6 };
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(
      makeVenuePolicy({ depositType: "flat" })
    );
    vi.mocked(moveReservationToHold).mockResolvedValueOnce({
      success: true,
      reservation: updated,
    } as never);

    const result = await modifyHeld(reservation, { partySize: 6 });

    expect(result.success).toBe(true);
    expect(depositService.getByReservationId).not.toHaveBeenCalled();
  });

  it("passes through a same-value partySize (no-op) without checking the deposit", async () => {
    const reservation = makeReservation({ partySize: 4, notes: "old" });
    const updated = { ...reservation, notes: "new" };
    vi.mocked(moveReservationToHold).mockResolvedValueOnce({
      success: true,
      reservation: updated,
    } as never);

    const result = await modifyHeld(reservation, { partySize: 4, specialRequests: "new" });

    expect(result.success).toBe(true);
    expect(venueService.getPolicyById).not.toHaveBeenCalled();
    expect(depositService.getByReservationId).not.toHaveBeenCalled();
  });

  it("passes through a date/time-only change without checking the deposit", async () => {
    const reservation = makeReservation({ partySize: 4 });
    const updated = { ...reservation, startTime: "20:00" };
    vi.mocked(moveReservationToHold).mockResolvedValueOnce({
      success: true,
      reservation: updated,
    } as never);

    const result = await modifyHeld(reservation, { startTime: iso0() });

    expect(result.success).toBe(true);
    expect(venueService.getPolicyById).not.toHaveBeenCalled();
    expect(depositService.getByReservationId).not.toHaveBeenCalled();
  });
});
