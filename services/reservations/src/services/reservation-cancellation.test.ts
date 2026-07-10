import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Reservation } from "@mbe/types";
import type { Mock } from "vitest";

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
import { ReservationTransitionError } from "./reservation-state-machine.js";
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
      cancelBookingNotifications: vi.fn().mockResolvedValue(undefined),
    },
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  } as unknown as CancelReservationDeps & {
    bookingNotifier: { cancelBookingReminders: Mock; cancelBookingNotifications: Mock };
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

  it("returns a 409 failure BEFORE touching the deposit when the reservation cannot transition to CANCELLED (stranded-deposit guard, #2930)", async () => {
    // Reproduces the prod bug: a staff cancel of an already-CANCELLED
    // reservation that (in prod) still has a held deposit. resolveDeposit()
    // must never run — the deposit money-move happens before the transition
    // check would otherwise fire deep inside reservationService.update(),
    // stranding the refund against a 409 response. No getByReservationId
    // mock is queued here: the assertion below proves it's never called, so
    // queuing an unconsumed `mockResolvedValueOnce` would only desync the
    // shared once-queue for later tests.
    const reservation = makeReservation({ status: "CANCELLED" });

    const result = await cancelReservationWithDeposit(reservation, "token123", makeDeps(), {
      initiator: "staff",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(409);
    }
    expect(depositService.getByReservationId).not.toHaveBeenCalled();
    expect(depositService.refund).not.toHaveBeenCalled();
    expect(reservationService.update).not.toHaveBeenCalled();
  });

  it("crosses exactly one notifier seam on success: bookingNotifier.cancelBookingNotifications (was two)", async () => {
    // The caller used to reach two seams — cancelBookingReminders on the
    // notifier AND sendBookingCancelled on a separate dispatcher. It now hands
    // the whole "cancel this booking's notifications" intent to BookingNotifier
    // in a single call; the dispatcher is a collaborator nested behind it.
    const reservation = makeReservation();
    const deps = makeDeps();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(null as never);
    vi.mocked(reservationService.update).mockResolvedValueOnce({
      ...reservation,
      status: "CANCELLED",
    } as never);

    const result = await cancelReservationWithDeposit(reservation, "token123", deps, {
      initiator: "guest",
    });

    expect(result.success).toBe(true);
    expect(deps.bookingNotifier.cancelBookingNotifications).toHaveBeenCalledTimes(1);
    expect(deps.bookingNotifier.cancelBookingNotifications).toHaveBeenCalledWith(
      reservation,
      "token123",
      "guest"
    );
    // The caller no longer crosses the lower-level reminder seam directly.
    expect(deps.bookingNotifier.cancelBookingReminders).not.toHaveBeenCalled();
  });

  describe("initiator: staff", () => {
    it("refunds a held deposit in full, waiving any cancellation fee policy", async () => {
      // Reservation is well past the free-cancellation window (would be a
      // partial refund/forfeit under guest policy) — staff cancels must still
      // refund the deposit in full and must never consult the fee policy.
      const reservation = makeReservation({
        startTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      });
      vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
      vi.mocked(depositService.refund).mockResolvedValueOnce({
        ...heldDeposit,
        status: "refunded",
      } as never);
      vi.mocked(reservationService.update).mockResolvedValueOnce({
        ...reservation,
        status: "CANCELLED",
      } as never);

      const result = await cancelReservationWithDeposit(reservation, "", makeDeps(), {
        initiator: "staff",
      });

      expect(result.success).toBe(true);
      expect(depositService.refund).toHaveBeenCalledWith("dep_1");
      expect(depositService.refundPartial).not.toHaveBeenCalled();
      expect(depositService.forfeit).not.toHaveBeenCalled();
      expect(venueService.getRawById).not.toHaveBeenCalled();
    });

    it("aborts the cancel when the staff refund fails (no ghost state)", async () => {
      const reservation = makeReservation();
      vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
      vi.mocked(depositService.refund).mockRejectedValueOnce(new Error("Stripe unavailable"));

      const result = await cancelReservationWithDeposit(reservation, "", makeDeps(), {
        initiator: "staff",
      });

      expect(result.success).toBe(false);
      expect(reservationService.update).not.toHaveBeenCalled();
    });

    it("persists cancellationReason and cancellationNote when provided", async () => {
      const reservation = makeReservation();
      vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(null as never);
      vi.mocked(reservationService.update).mockResolvedValueOnce({
        ...reservation,
        status: "CANCELLED",
        cancellationReason: "no_show_policy",
        cancellationNote: "Guest called ahead",
      } as never);

      const result = await cancelReservationWithDeposit(reservation, "", makeDeps(), {
        initiator: "staff",
        cancellationReason: "no_show_policy",
        cancellationNote: "Guest called ahead",
      });

      expect(result.success).toBe(true);
      expect(reservationService.update).toHaveBeenCalledWith("res_1", {
        status: "CANCELLED",
        cancellationReason: "no_show_policy",
        cancellationNote: "Guest called ahead",
      });
    });

    it("still replays a partial_refunded retry from persisted amounts (retry guard is initiator-agnostic)", async () => {
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

      const result = await cancelReservationWithDeposit(reservation, "", makeDeps(), {
        initiator: "staff",
      });

      expect(result.success).toBe(true);
      expect(depositService.refundPartial).toHaveBeenCalledWith("dep_1", 5000);
      expect(depositService.refund).not.toHaveBeenCalled();
    });
  });

  it("fires exactly one notification when two cancels race (CAS dedup, #3109)", async () => {
    // Two concurrent cancels of a no-deposit reservation. Before the CAS,
    // both passed validation against the same status snapshot, both flipped
    // the row, and both notified — two guest emails. Now the status-guarded
    // updateMany matches for exactly one caller; the loser's update() returns
    // null (count 0), so it short-circuits with a 409 and never notifies.
    const reservation = makeReservation();
    const deps = makeDeps();

    vi.mocked(depositService.getByReservationId).mockResolvedValue(null as never);
    vi.mocked(reservationService.update)
      .mockResolvedValueOnce({ ...reservation, status: "CANCELLED" } as never)
      .mockResolvedValueOnce(null as never);

    const outcomes = await Promise.all([
      cancelReservationWithDeposit(reservation, "token123", deps),
      cancelReservationWithDeposit(reservation, "token123", deps),
    ]);

    expect(outcomes.filter((r) => r.success)).toHaveLength(1);
    const loser = outcomes.find((r) => !r.success);
    expect(loser).toBeDefined();
    if (loser && !loser.success) {
      expect(loser.status).toBe(409);
    }
    // The single-seam notification path fires exactly once: only the winning
    // cancel reaches it; the loser short-circuits on the CAS miss.
    expect(deps.bookingNotifier.cancelBookingNotifications).toHaveBeenCalledTimes(1);
  });

  it("logs and returns a distinct non-409 result when the final update throws ReservationTransitionError after the deposit is already resolved (ghost-state guard, #3278)", async () => {
    // A concurrent status change lands DURING the Stripe round trip: the
    // deposit forfeiture (money) succeeds, then reservationService.update
    // re-validates the transition against the now-changed row and throws
    // ReservationTransitionError. This is the ghost-state path — money moved,
    // reservation status unchanged — NOT the CAS-count-zero short-circuit
    // (which returns null). It must log at error naming the already-resolved
    // deposit + Stripe op, and MUST NOT read as a harmless 409.
    const reservation = makeReservation({
      startTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    const deps = makeDeps();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
    vi.mocked(venueService.getRawById).mockResolvedValueOnce(rawVenueWithPolicy as never);
    vi.mocked(depositService.forfeit).mockResolvedValueOnce({
      ...heldDeposit,
      status: "forfeited",
    } as never);
    vi.mocked(reservationService.update).mockRejectedValueOnce(
      new ReservationTransitionError("NO_SHOW", "CANCELLED", [], "reservation")
    );

    const result = await cancelReservationWithDeposit(reservation, "token123", deps);

    // (a) logged at error level, naming the already-resolved deposit + Stripe op.
    expect(deps.logger.error).toHaveBeenCalledTimes(1);
    const [logContext] = vi.mocked(deps.logger.error).mock.calls[0] as [Record<string, unknown>];
    expect(logContext).toMatchObject({
      reservationId: "res_1",
      depositId: "dep_1",
      stripeOp: "forfeit",
    });
    // (b) distinct result, NOT a bare 409 harmless conflict.
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).not.toBe(409);
    }
    // (c) this is the post-resolution transition-error path: the deposit
    // money-move DID run, and no re-notification fires on the failed cancel.
    expect(depositService.forfeit).toHaveBeenCalledWith("dep_1");
    expect(deps.bookingNotifier.cancelBookingNotifications).not.toHaveBeenCalled();
  });

  it("returns a harmless 409 (no error log, no 500) when the final update throws ReservationTransitionError but no deposit was resolved (concurrent loser, #3278)", async () => {
    // The double-cancel loser: no held deposit (getByReservationId -> null, so
    // resolved === null — no money moved this call), and the winning request
    // already flipped the row to CANCELLED, so update() re-validates and throws
    // ReservationTransitionError. Because no money moved this is the ordinary
    // harmless conflict, NOT a ghost state: it must return 409 and MUST NOT log
    // an error or emit the manual-reconciliation 500 (which would be a false
    // finance-reconciliation alarm).
    const reservation = makeReservation();
    const deps = makeDeps();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(null as never);
    vi.mocked(reservationService.update).mockRejectedValueOnce(
      new ReservationTransitionError("CANCELLED", "CANCELLED", [], "reservation")
    );

    const result = await cancelReservationWithDeposit(reservation, "token123", deps);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(409);
    }
    expect(deps.logger.error).not.toHaveBeenCalled();
    expect(depositService.refund).not.toHaveBeenCalled();
    expect(depositService.forfeit).not.toHaveBeenCalled();
    expect(deps.bookingNotifier.cancelBookingNotifications).not.toHaveBeenCalled();
  });
});
