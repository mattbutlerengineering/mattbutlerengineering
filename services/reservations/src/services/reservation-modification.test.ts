import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Reservation } from "@mbe/types";

vi.mock("./reservation.js", () => ({
  reservationService: {
    updateWithConflictCheck: vi.fn(),
  },
}));

vi.mock("./venue.js", () => ({
  venueService: {
    getById: vi.fn(),
    getPolicyById: vi.fn(),
  },
}));

import { reservationService } from "./reservation.js";
import { venueService } from "./venue.js";
import type { VenuePolicy } from "./venue.js";
import type { DepositService } from "./deposit.js";
import { modifyReservation } from "./reservation-modification.js";

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

  it("returns SLOT_UNAVAILABLE (409) when the conflict check reports a conflict", async () => {
    const reservation = makeReservation();
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: false,
      error: "Time slot has a conflict with an existing reservation or hold",
      conflict: { hasConflict: true },
    } as never);

    const result = await modifyReservation(reservation, { startTime: "18:00" }, deposits);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(409);
      expect(result.code).toBe("SLOT_UNAVAILABLE");
    }
  });

  it("returns RESERVATION_UPDATE_FAILED (500) when the update fails without a conflict", async () => {
    const reservation = makeReservation();
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: false,
      error: "Database unavailable",
    } as never);

    const result = await modifyReservation(reservation, { partySize: 2 }, deposits);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(500);
      expect(result.code).toBe("RESERVATION_UPDATE_FAILED");
    }
  });

  it("returns PARTY_SIZE_EXCEEDS_TABLE (422) when the new partySize exceeds table capacity", async () => {
    const reservation = makeReservation();
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: false,
      error: "Party size 10 exceeds table capacity of 4",
      capacityExceeded: true,
    } as never);

    const result = await modifyReservation(reservation, { partySize: 10 }, deposits);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(422);
      expect(result.code).toBe("PARTY_SIZE_EXCEEDS_TABLE");
    }
  });

  it("maps changes onto the update payload (specialRequests -> notes)", async () => {
    const reservation = makeReservation();
    const updated = { ...reservation, notes: "No peanuts please" };
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: true,
      reservation: updated,
    } as never);

    await modifyReservation(reservation, { specialRequests: "No peanuts please" }, deposits);

    expect(reservationService.updateWithConflictCheck).toHaveBeenCalledWith("res_1", {
      notes: "No peanuts please",
    });
  });

  it("updates partySize when there is no held/pending deposit at all", async () => {
    const reservation = makeReservation({ partySize: 4 });
    const updated = { ...reservation, partySize: 10 };
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(
      makeVenuePolicy({ depositType: "per_person" })
    );
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(null);
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: true,
      reservation: updated,
    } as never);

    const result = await modifyReservation(reservation, { partySize: 10 }, deposits);

    expect(result.success).toBe(true);
    expect(reservationService.updateWithConflictCheck).toHaveBeenCalledWith("res_1", {
      partySize: 10,
    });
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

    const result = await modifyReservation(reservation, { partySize: 6 }, deposits);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(409);
      expect(result.code).toBe("PARTY_SIZE_DEPOSIT_HELD");
      expect(result.detail).toMatch(/cancel/i);
    }
    expect(reservationService.updateWithConflictCheck).not.toHaveBeenCalled();
  });

  it("blocks a partySize DECREASE with 409 when a per_person deposit is held", async () => {
    const reservation = makeReservation({ partySize: 6 });
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(
      makeVenuePolicy({ depositType: "per_person" })
    );
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce({
      status: "held",
    } as never);

    const result = await modifyReservation(reservation, { partySize: 4 }, deposits);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(409);
      expect(result.code).toBe("PARTY_SIZE_DEPOSIT_HELD");
    }
    expect(reservationService.updateWithConflictCheck).not.toHaveBeenCalled();
  });

  it("blocks when the per_person deposit is still pending (not yet held)", async () => {
    const reservation = makeReservation({ partySize: 4 });
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(
      makeVenuePolicy({ depositType: "per_person" })
    );
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce({
      status: "pending",
    } as never);

    const result = await modifyReservation(reservation, { partySize: 8 }, deposits);

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
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: true,
      reservation: updated,
    } as never);

    const result = await modifyReservation(reservation, { partySize: 6 }, deposits);

    expect(result.success).toBe(true);
    expect(depositService.getByReservationId).not.toHaveBeenCalled();
  });

  it("passes through a same-value partySize (no-op) without checking the deposit", async () => {
    const reservation = makeReservation({ partySize: 4, notes: "old" });
    const updated = { ...reservation, notes: "new" };
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: true,
      reservation: updated,
    } as never);

    const result = await modifyReservation(
      reservation,
      { partySize: 4, specialRequests: "new" },
      deposits
    );

    expect(result.success).toBe(true);
    expect(venueService.getPolicyById).not.toHaveBeenCalled();
    expect(depositService.getByReservationId).not.toHaveBeenCalled();
  });

  it("passes through a date/time-only change without checking the deposit", async () => {
    const reservation = makeReservation({ partySize: 4 });
    const updated = { ...reservation, startTime: "20:00" };
    vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValueOnce({
      success: true,
      reservation: updated,
    } as never);

    const result = await modifyReservation(reservation, { startTime: "20:00" }, deposits);

    expect(result.success).toBe(true);
    expect(venueService.getPolicyById).not.toHaveBeenCalled();
    expect(depositService.getByReservationId).not.toHaveBeenCalled();
  });
});
