import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import type { Reservation } from "@mbe/types";

vi.mock("./reservation.js", () => ({
  reservationService: {
    update: vi.fn(),
  },
}));

vi.mock("./deposit.js", () => ({
  depositService: {
    getByReservationId: vi.fn(),
    forfeit: vi.fn(),
  },
}));

import { reservationService } from "./reservation.js";
import { depositService } from "./deposit.js";
import { recordNoShow } from "./reservation-no-show.js";

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res_1",
    date: "2026-06-15",
    startTime: "2026-06-15T19:00:00Z",
    endTime: "2026-06-15T21:00:00Z",
    partySize: 4,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Jane Doe",
    guestEmail: "jane@example.com",
    guestPhone: null,
    guestId: "guest_1",
    userId: null,
    occasion: null,
    seatingPreference: null,
    tableId: "table_1",
    guest: { visitCount: 1, communicationPreference: "email_only" },
    venueId: "venue_1",
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

function makeLogger(): FastifyBaseLogger {
  return { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as unknown as FastifyBaseLogger;
}

const heldDeposit = {
  id: "dep_1",
  reservationId: "res_1",
  amountCents: 10000,
  currency: "usd",
  status: "held",
  stripePaymentIntentId: "pi_test_123",
  stripeCustomerId: null,
  heldAt: new Date(),
  appliedAt: null,
  refundedAt: null,
  forfeitedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("recordNoShow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forfeits a held deposit and marks the reservation NO_SHOW (end-to-end)", async () => {
    const reservation = makeReservation();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
    vi.mocked(depositService.forfeit).mockResolvedValueOnce({
      ...heldDeposit,
      status: "forfeited",
    } as never);
    vi.mocked(reservationService.update).mockResolvedValueOnce({
      ...reservation,
      status: "NO_SHOW",
    } as never);

    const result = await recordNoShow(reservation, makeLogger());

    expect(result.success).toBe(true);
    expect(depositService.forfeit).toHaveBeenCalledWith("dep_1");
    expect(reservationService.update).toHaveBeenCalledWith("res_1", { status: "NO_SHOW" });
    if (result.success) {
      expect(result.reservation.status).toBe("NO_SHOW");
    }
  });

  it("records NO_SHOW with no deposit — counter/risk path still runs, no forfeiture attempted", async () => {
    const reservation = makeReservation();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(null);
    vi.mocked(reservationService.update).mockResolvedValueOnce({
      ...reservation,
      status: "NO_SHOW",
    } as never);

    const result = await recordNoShow(reservation, makeLogger());

    expect(result.success).toBe(true);
    expect(depositService.forfeit).not.toHaveBeenCalled();
    expect(reservationService.update).toHaveBeenCalledWith("res_1", { status: "NO_SHOW" });
  });

  it("does not forfeit a deposit that is not held (e.g. already refunded)", async () => {
    const reservation = makeReservation();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce({
      ...heldDeposit,
      status: "refunded",
    } as never);
    vi.mocked(reservationService.update).mockResolvedValueOnce({
      ...reservation,
      status: "NO_SHOW",
    } as never);

    const result = await recordNoShow(reservation, makeLogger());

    expect(result.success).toBe(true);
    expect(depositService.forfeit).not.toHaveBeenCalled();
  });

  it("returns a 409 failure BEFORE touching the deposit when the reservation cannot transition to NO_SHOW", async () => {
    const reservation = makeReservation({ status: "CANCELLED" });

    const result = await recordNoShow(reservation, makeLogger());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(409);
    }
    expect(depositService.getByReservationId).not.toHaveBeenCalled();
    expect(reservationService.update).not.toHaveBeenCalled();
  });

  it("aborts and does not write NO_SHOW when deposit forfeiture fails (no ghost state)", async () => {
    const reservation = makeReservation();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
    vi.mocked(depositService.forfeit).mockRejectedValueOnce(new Error("Stripe unavailable"));

    const result = await recordNoShow(reservation, makeLogger());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(500);
    }
    expect(reservationService.update).not.toHaveBeenCalled();
  });

  it("returns a 409 conflict when a concurrent request already transitioned the reservation", async () => {
    const reservation = makeReservation();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(null);
    vi.mocked(reservationService.update).mockResolvedValueOnce(null);

    const result = await recordNoShow(reservation, makeLogger());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(409);
    }
  });
});
