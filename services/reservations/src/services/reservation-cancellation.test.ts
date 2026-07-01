import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Reservation } from "@mbe/types";

vi.mock("./reservation.js", () => ({
  reservationService: {
    update: vi.fn(),
  },
}));

vi.mock("./venue.js", () => ({
  venueService: {
    getById: vi.fn(),
    getRawById: vi.fn(),
  },
}));

vi.mock("./deposit.js", () => ({
  depositService: {
    getByReservationId: vi.fn(),
    refund: vi.fn(),
    refundPartial: vi.fn(),
    forfeit: vi.fn(),
  },
}));

import { reservationService } from "./reservation.js";
import { venueService } from "./venue.js";
import { depositService } from "./deposit.js";
import {
  cancelReservationWithDeposit,
  type CancelReservationDeps,
} from "./reservation-cancellation.js";

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res_1",
    date: "2026-06-15",
    startTime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    endTime: "2026-06-15T21:00:00Z",
    partySize: 4,
    status: "PENDING",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Jane Doe",
    guestEmail: "jane@example.com",
    guestPhone: null,
    guestId: null,
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

function makeDeps() {
  return {
    bookingNotifier: {
      scheduleBookingNotifications: vi.fn().mockResolvedValue(undefined),
      cancelBookingReminders: vi.fn().mockResolvedValue(undefined),
      rescheduleBookingReminders: vi.fn().mockResolvedValue(undefined),
    },
    notificationPort: {
      sendBookingConfirmation: vi.fn().mockResolvedValue(undefined),
      sendBookingReminder: vi.fn().mockResolvedValue(undefined),
      sendBookingModified: vi.fn().mockResolvedValue(undefined),
      sendBookingCancelled: vi.fn().mockResolvedValue(undefined),
      sendWinBack: vi.fn().mockResolvedValue(undefined),
    },
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  } as unknown as CancelReservationDeps & {
    bookingNotifier: { cancelBookingReminders: ReturnType<typeof vi.fn> };
    notificationPort: { sendBookingCancelled: ReturnType<typeof vi.fn> };
  };
}

const rawVenueWithPolicy = {
  id: "venue_1",
  freeCancellationHours: 24,
  lateCancellationFeePercent: 50,
  noShowFeePercent: 100,
};

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

describe("cancelReservationWithDeposit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forfeits the deposit at the no-show boundary (reservation already started)", async () => {
    const reservation = makeReservation({
      startTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
    vi.mocked(venueService.getRawById).mockResolvedValueOnce(rawVenueWithPolicy as never);
    vi.mocked(depositService.forfeit).mockResolvedValueOnce({
      ...heldDeposit,
      status: "forfeited",
    } as never);
    vi.mocked(reservationService.update).mockResolvedValueOnce({
      ...reservation,
      status: "CANCELLED",
    } as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(null);

    const result = await cancelReservationWithDeposit(reservation, "token123", makeDeps());

    expect(result.success).toBe(true);
    expect(depositService.forfeit).toHaveBeenCalledWith("dep_1");
    expect(depositService.refund).not.toHaveBeenCalled();
    expect(depositService.refundPartial).not.toHaveBeenCalled();
  });

  it("replays refundPartial from persisted amounts on retry across the no-show boundary", async () => {
    // First attempt captured the card but failed to refund, leaving the
    // deposit `partial_refunded`. A retry now lands after the reservation
    // start time (no-show territory) — the clock-derived action would be
    // `forfeit`, but the retry MUST replay the persisted amounts instead.
    const reservation = makeReservation({
      startTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    const partialRefundedDeposit = {
      ...heldDeposit,
      status: "partial_refunded",
      feeAmountCents: 5000,
      refundAmountCents: 5000,
    };
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(
      partialRefundedDeposit as never
    );
    vi.mocked(depositService.refundPartial).mockResolvedValueOnce({
      ...partialRefundedDeposit,
    } as never);
    vi.mocked(reservationService.update).mockResolvedValueOnce({
      ...reservation,
      status: "CANCELLED",
    } as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce(null);

    const result = await cancelReservationWithDeposit(reservation, "token123", makeDeps());

    expect(result.success).toBe(true);
    expect(depositService.refundPartial).toHaveBeenCalledWith("dep_1", 5000);
    expect(venueService.getRawById).not.toHaveBeenCalled();
    expect(depositService.forfeit).not.toHaveBeenCalled();
  });

  it("returns a failure result when a partial_refunded deposit has no persisted amounts", async () => {
    const reservation = makeReservation();
    const partialRefundedNoAmounts = {
      ...heldDeposit,
      status: "partial_refunded",
      feeAmountCents: null,
      refundAmountCents: null,
    };
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(
      partialRefundedNoAmounts as never
    );

    const result = await cancelReservationWithDeposit(reservation, "token123", makeDeps());

    expect(result.success).toBe(false);
    expect(depositService.refundPartial).not.toHaveBeenCalled();
    expect(reservationService.update).not.toHaveBeenCalled();
  });

  it("aborts the cancel and does not flip status when the deposit refund fails (no ghost state)", async () => {
    const reservation = makeReservation();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
    vi.mocked(venueService.getRawById).mockResolvedValueOnce(rawVenueWithPolicy as never);
    vi.mocked(depositService.refund).mockRejectedValueOnce(new Error("Stripe unavailable"));

    const result = await cancelReservationWithDeposit(reservation, "token123", makeDeps());

    expect(result.success).toBe(false);
    expect(reservationService.update).not.toHaveBeenCalled();
  });

  it("cancels reminder jobs and dispatches the guest notification on success", async () => {
    const reservation = makeReservation();
    const deps = makeDeps();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(null as never);
    vi.mocked(reservationService.update).mockResolvedValueOnce({
      ...reservation,
      status: "CANCELLED",
    } as never);
    vi.mocked(venueService.getById).mockResolvedValueOnce({
      id: "venue_1",
      name: "The Oak Table",
      ianaTimezone: "America/Los_Angeles",
    } as never);

    const result = await cancelReservationWithDeposit(reservation, "token123", deps);

    expect(result.success).toBe(true);
    expect(deps.bookingNotifier.cancelBookingReminders).toHaveBeenCalledWith("res_1");
    expect(deps.notificationPort.sendBookingCancelled).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: "res_1", manageToken: "token123" }),
      "email_only"
    );
  });
});
