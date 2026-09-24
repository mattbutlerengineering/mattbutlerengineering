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
import { ReservationTransitionError } from "./reservation-state-machine.js";

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

  it("warns and proceeds without forfeiting when the deposit is still pending (not yet authorized)", async () => {
    // A `pending` deposit has no confirmed Stripe authorization to forfeit —
    // silently skipping it (pre-#5719 behaviour) let staff believe a no-show
    // fee was collected when nothing moved. Surface it instead of hiding it.
    const reservation = makeReservation();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce({
      id: "dep_1",
      status: "pending",
    } as never);
    vi.mocked(reservationService.update).mockResolvedValueOnce({
      ...reservation,
      status: "NO_SHOW",
    } as never);
    const logger = makeLogger();

    const result = await recordNoShow(reservation, logger);

    expect(result.success).toBe(true);
    expect(depositService.forfeit).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: "res_1", depositId: "dep_1" }),
      expect.stringMatching(/pending/i)
    );
    if (result.success) {
      expect(result.depositWarning).toMatch(/pending/i);
    }
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

  it("logs and returns a distinct non-409 result when the status write fails AFTER the deposit was already forfeited (ghost-state guard)", async () => {
    // A concurrent status change lands DURING the Stripe round trip: the
    // deposit forfeit (money) succeeds, then reservationService.update
    // re-validates the transition against the now-changed row and throws
    // ReservationTransitionError. Money moved, reservation status did not —
    // this must be logged for reconciliation and MUST NOT read as a harmless
    // 409 (#5719 item 2).
    const reservation = makeReservation();
    const logger = makeLogger();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
    vi.mocked(depositService.forfeit).mockResolvedValueOnce({
      ...heldDeposit,
      status: "forfeited",
    } as never);
    vi.mocked(reservationService.update).mockRejectedValueOnce(
      new ReservationTransitionError("NO_SHOW", "CANCELLED", [], "reservation")
    );

    const result = await recordNoShow(reservation, logger);

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [logContext] = vi.mocked(logger.error).mock.calls[0] as [Record<string, unknown>];
    expect(logContext).toMatchObject({ reservationId: "res_1", depositId: "dep_1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).not.toBe(409);
    }
  });

  it("re-throws (harmless 409 path) when the status write fails but no deposit was forfeited this call", async () => {
    const reservation = makeReservation();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(null);
    vi.mocked(reservationService.update).mockRejectedValueOnce(
      new ReservationTransitionError("NO_SHOW", "CANCELLED", [], "reservation")
    );
    const logger = makeLogger();

    const result = await recordNoShow(reservation, logger);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(409);
    }
    expect(logger.error).not.toHaveBeenCalled();
  });
});
