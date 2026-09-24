import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import type { Reservation } from "@mbe/types";
import type * as DepositModule from "./deposit.js";

vi.mock("./reservation.js", () => ({
  reservationService: {
    update: vi.fn(),
    getById: vi.fn(),
  },
}));

vi.mock("./deposit.js", async () => {
  // The real error classes, not stand-ins: recordNoShow's `instanceof` checks
  // are only meaningful if the class the test throws is the class it imports.
  const actual = await vi.importActual<typeof DepositModule>("./deposit.js");
  return {
    DepositConcurrentUpdateError: actual.DepositConcurrentUpdateError,
    DepositTransitionError: actual.DepositTransitionError,
    depositService: {
      getByReservationId: vi.fn(),
      getById: vi.fn(),
      forfeit: vi.fn(),
      refundPartial: vi.fn(),
      refund: vi.fn(),
    },
  };
});

vi.mock("./venue.js", () => ({
  venueService: {
    getPolicyById: vi.fn(),
  },
}));

import { reservationService } from "./reservation.js";
import { depositService, DepositConcurrentUpdateError } from "./deposit.js";
import { StripeOperationError } from "./stripe.js";
import { venueService } from "./venue.js";
import type { VenuePolicy } from "./venue.js";
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

// A 100% no-show fee reproduces the pre-#5719-item-6 behaviour (full
// forfeit) for tests that aren't specifically about the fee split.
const fullNoShowFeeVenuePolicy: VenuePolicy = {
  id: "venue_1",
  slug: "the-oak-table",
  currencyCode: "USD",
  depositEnabled: true,
  depositType: "flat",
  depositAmountCents: null,
  freeCancellationHours: 24,
  lateCancellationFeePercent: 50,
  noShowFeePercent: 100,
};

describe("recordNoShow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forfeits a held deposit and marks the reservation NO_SHOW (end-to-end)", async () => {
    const reservation = makeReservation();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(fullNoShowFeeVenuePolicy);
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

  it("returns success (not a 500) when a concurrent/retried forfeit loses the CAS but the winner already marked NO_SHOW", async () => {
    // Two concurrent no-show requests both pass the initial transition check
    // and both call forfeit(). The loser's CAS returns count 0 and forfeit()
    // throws DepositConcurrentUpdateError — but the winner already forfeited
    // AND wrote NO_SHOW. Reporting "not marked" here would be a false failure
    // on top of a real success (#5719 item 3).
    const reservation = makeReservation();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(fullNoShowFeeVenuePolicy);
    vi.mocked(depositService.forfeit).mockRejectedValueOnce(
      new DepositConcurrentUpdateError("dep_1", "forfeit")
    );
    vi.mocked(reservationService.getById).mockResolvedValueOnce({
      ...reservation,
      status: "NO_SHOW",
    } as never);

    const result = await recordNoShow(reservation, makeLogger());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.reservation.status).toBe("NO_SHOW");
    }
    expect(reservationService.update).not.toHaveBeenCalled();
  });

  it("still returns the 500 failure when the CAS loses but the reservation was NOT actually marked NO_SHOW", async () => {
    const reservation = makeReservation();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(fullNoShowFeeVenuePolicy);
    vi.mocked(depositService.forfeit).mockRejectedValueOnce(
      new DepositConcurrentUpdateError("dep_1", "forfeit")
    );
    vi.mocked(reservationService.getById).mockResolvedValueOnce({
      ...reservation,
      status: "CONFIRMED",
    } as never);

    const result = await recordNoShow(reservation, makeLogger());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(500);
    }
  });

  it("aborts and does not write NO_SHOW when deposit forfeiture fails (no ghost state)", async () => {
    const reservation = makeReservation();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(fullNoShowFeeVenuePolicy);
    vi.mocked(depositService.forfeit).mockRejectedValueOnce(new Error("Stripe unavailable"));

    const result = await recordNoShow(reservation, makeLogger());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(500);
    }
    expect(reservationService.update).not.toHaveBeenCalled();
  });

  it("records the no-show against an already-uncollectable deposit after a permanent capture failure (e.g. expired authorization)", async () => {
    // `deposit.ts` itself verifies the real Stripe state via retrieve and
    // writes the row off as `uncollectable` before rethrowing (#5719 H2) —
    // this layer reads that outcome back from the row's current status
    // rather than re-deriving it from the error's retriable/non-retriable
    // shape. Silently failing the whole no-show made it unrecordable
    // forever; instead proceed with a warning (#5719 item 5).
    const reservation = makeReservation();
    const logger = makeLogger();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(fullNoShowFeeVenuePolicy);
    vi.mocked(depositService.forfeit).mockRejectedValueOnce(
      new StripeOperationError(new Error("charge expired"), "StripeInvalidRequestError", false)
    );
    vi.mocked(depositService.getById).mockResolvedValueOnce({
      ...heldDeposit,
      status: "uncollectable",
    } as never);
    vi.mocked(reservationService.update).mockResolvedValueOnce({
      ...reservation,
      status: "NO_SHOW",
    } as never);

    const result = await recordNoShow(reservation, logger);

    expect(depositService.getById).toHaveBeenCalledWith("dep_1");
    expect(reservationService.update).toHaveBeenCalledWith("res_1", { status: "NO_SHOW" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.depositWarning).toMatch(/uncollectable|expired/i);
    }
  });

  it("still fails the no-show when the deposit stays held after a capture failure (Stripe confirms requires_capture)", async () => {
    const reservation = makeReservation();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(fullNoShowFeeVenuePolicy);
    vi.mocked(depositService.forfeit).mockRejectedValueOnce(new Error("stripe boom"));
    vi.mocked(depositService.getById).mockResolvedValueOnce({
      ...heldDeposit,
      status: "held",
    } as never);

    const result = await recordNoShow(reservation, makeLogger());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(500);
    }
    expect(reservationService.update).not.toHaveBeenCalled();
  });

  it("never writes off a hold on a non-retriable auth/config error that never reached Stripe's network (#5719 H2)", async () => {
    // A non-retriable StripeAuthenticationError does NOT prove the capture
    // was declined by Stripe — it means the request never got there. Since
    // `deposit.ts` verifies via retrieve and only rolls back to `held` (never
    // writes off) when Stripe confirms `requires_capture`, the row here is
    // still `held` — this must surface as a plain failure, never a false
    // "uncollectable" write-off.
    const reservation = makeReservation();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(fullNoShowFeeVenuePolicy);
    vi.mocked(depositService.forfeit).mockRejectedValueOnce(
      new StripeOperationError(new Error("invalid api key"), "StripeAuthenticationError", false)
    );
    vi.mocked(depositService.getById).mockResolvedValueOnce({
      ...heldDeposit,
      status: "held",
    } as never);

    const result = await recordNoShow(reservation, makeLogger());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(500);
    }
  });

  it("treats a capture as resolved when the row already reflects the completed forfeit despite the thrown error", async () => {
    // deposit.ts confirmed via retrieve that the charge actually succeeded
    // (the failure was purely transport-side) and deliberately left the row
    // at `forfeited` rather than rolling back. Reporting a failure here on
    // top of a real success would be a false alarm.
    const reservation = makeReservation();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(fullNoShowFeeVenuePolicy);
    vi.mocked(depositService.forfeit).mockRejectedValueOnce(new Error("timeout"));
    vi.mocked(depositService.getById).mockResolvedValueOnce({
      ...heldDeposit,
      status: "forfeited",
      forfeitedAt: new Date(),
    } as never);
    vi.mocked(reservationService.update).mockResolvedValueOnce({
      ...reservation,
      status: "NO_SHOW",
    } as never);

    const result = await recordNoShow(reservation, makeLogger());

    expect(result.success).toBe(true);
    expect(reservationService.update).toHaveBeenCalledWith("res_1", { status: "NO_SHOW" });
  });

  it("does NOT report a partial no-show as resolved when refundPartial throws with the row left partial_refunded (refund leg never landed)", async () => {
    // A partial_refunded row after refundPartial threw means the fee capture
    // landed but the guest's remainder refund did not (either the refund leg
    // itself threw, or the capture outcome was ambiguous and the refund was
    // never attempted). Recording NO_SHOW here would close the only retry
    // path (the partial_refunded replay branch) and tell staff the guest was
    // refunded when they were not (stripe-flow-reviewer, PR #5722).
    const reservation = makeReservation();
    const partialFeePolicy: VenuePolicy = { ...fullNoShowFeeVenuePolicy, noShowFeePercent: 60 };
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(partialFeePolicy);
    vi.mocked(depositService.refundPartial).mockRejectedValueOnce(new Error("stripe refund boom"));
    vi.mocked(depositService.getById).mockResolvedValueOnce({
      ...heldDeposit,
      status: "partial_refunded",
      refundAmountCents: 4000,
    } as never);
    const logger = makeLogger();

    const result = await recordNoShow(reservation, logger);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(500);
      expect(result.detail).toMatch(/refund/i);
      expect(result.detail).toMatch(/retry/i);
    }
    expect(reservationService.update).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it("captures only the disclosed noShowFeePercent and refunds the remainder (integer cents)", async () => {
    // The guest was disclosed a noShowFeePercent% fee (formatCancellationTerms),
    // but forfeit() captures the FULL deposit — a disclosure/charge mismatch.
    // Mirror the cancel path: capture the fee, refund the rest (#5719 item 6).
    const reservation = makeReservation();
    const partialFeePolicy: VenuePolicy = { ...fullNoShowFeeVenuePolicy, noShowFeePercent: 60 };
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(partialFeePolicy);
    vi.mocked(depositService.refundPartial).mockResolvedValueOnce({
      ...heldDeposit,
      status: "partial_refunded",
    } as never);
    vi.mocked(reservationService.update).mockResolvedValueOnce({
      ...reservation,
      status: "NO_SHOW",
    } as never);

    const result = await recordNoShow(reservation, makeLogger());

    // 60% of 10000 cents = 6000 fee, 4000 refunded — floored integer cents.
    expect(depositService.refundPartial).toHaveBeenCalledWith("dep_1", 4000);
    expect(depositService.forfeit).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it("evaluates the no-show fee tier even when marked slightly before the reservation's exact startTime (#5719 M4)", async () => {
    // Staff clicking "Mark No-Show" a few minutes early (before the reservation's
    // exact startTime clock tick) must still resolve the NO-SHOW fee tier, not
    // fall through to the (usually lower) late-cancellation tier — evaluate at
    // max(now, startTime), never bare `now`.
    const futureStartTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const reservation = makeReservation({ startTime: futureStartTime });
    const lateVsNoShowPolicy: VenuePolicy = {
      ...fullNoShowFeeVenuePolicy,
      lateCancellationFeePercent: 10,
      noShowFeePercent: 60,
    };
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(lateVsNoShowPolicy);
    vi.mocked(depositService.refundPartial).mockResolvedValueOnce({
      ...heldDeposit,
      status: "partial_refunded",
    } as never);
    vi.mocked(reservationService.update).mockResolvedValueOnce({
      ...reservation,
      status: "NO_SHOW",
    } as never);

    await recordNoShow(reservation, makeLogger());

    // 60% no-show fee on 10000 cents = 6000 fee, 4000 refunded — NOT the 10%
    // late-cancellation fee (9000 cents refunded).
    expect(depositService.refundPartial).toHaveBeenCalledWith("dep_1", 4000);
  });

  it("sets a depositWarning when the no-show resolves to a partial or full refund, so staff know the fee wasn't 100% (#5719 M4)", async () => {
    const reservation = makeReservation();
    const partialFeePolicy: VenuePolicy = { ...fullNoShowFeeVenuePolicy, noShowFeePercent: 60 };
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(partialFeePolicy);
    vi.mocked(depositService.refundPartial).mockResolvedValueOnce({
      ...heldDeposit,
      status: "partial_refunded",
    } as never);
    vi.mocked(reservationService.update).mockResolvedValueOnce({
      ...reservation,
      status: "NO_SHOW",
    } as never);

    const result = await recordNoShow(reservation, makeLogger());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.depositWarning).toMatch(/refund|60%|partial/i);
    }
  });

  it("cancels (never captures) when the no-show fee policy is 0% — no needless capture-then-refund-in-full round trip (#5719 LOW)", async () => {
    const reservation = makeReservation();
    const zeroFeePolicy: VenuePolicy = { ...fullNoShowFeeVenuePolicy, noShowFeePercent: 0 };
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(zeroFeePolicy);
    vi.mocked(depositService.refund).mockResolvedValueOnce({
      ...heldDeposit,
      status: "refunded",
    } as never);
    vi.mocked(reservationService.update).mockResolvedValueOnce({
      ...reservation,
      status: "NO_SHOW",
    } as never);

    const result = await recordNoShow(reservation, makeLogger());

    expect(depositService.refund).toHaveBeenCalledWith("dep_1");
    expect(depositService.refundPartial).not.toHaveBeenCalled();
    expect(depositService.forfeit).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
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
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(fullNoShowFeeVenuePolicy);
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

  it("replays a stuck partial_refunded deposit's refund on retry instead of silently skipping it (#5719 H1)", async () => {
    // A prior attempt captured the card but failed on the refund leg (or the
    // status write after it) — the deposit is left `partial_refunded`, not
    // `held`, so the old `held`-only branch silently skipped it entirely and
    // marked NO_SHOW without ever completing the guest's refund. Replay from
    // the persisted amount, mirroring resolveDeposit in
    // reservation-cancellation.ts.
    const reservation = makeReservation();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce({
      ...heldDeposit,
      status: "partial_refunded",
      refundAmountCents: 4000,
    } as never);
    vi.mocked(depositService.refundPartial).mockResolvedValueOnce({
      ...heldDeposit,
      status: "partial_refunded",
    } as never);
    vi.mocked(reservationService.update).mockResolvedValueOnce({
      ...reservation,
      status: "NO_SHOW",
    } as never);

    const result = await recordNoShow(reservation, makeLogger());

    expect(depositService.refundPartial).toHaveBeenCalledWith("dep_1", 4000);
    expect(venueService.getPolicyById).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it("aborts when replaying a stuck partial_refunded deposit's refund fails — never routes a refund-leg failure to uncollectable (#5719 H1)", async () => {
    const reservation = makeReservation();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce({
      ...heldDeposit,
      status: "partial_refunded",
      refundAmountCents: 4000,
    } as never);
    vi.mocked(depositService.refundPartial).mockRejectedValueOnce(new Error("stripe refund boom"));

    const result = await recordNoShow(reservation, makeLogger());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(500);
    }
    expect(depositService.getById).not.toHaveBeenCalled();
    expect(reservationService.update).not.toHaveBeenCalled();
  });

  it("aborts with a clear log when a partial_refunded deposit is missing its persisted refund amount", async () => {
    const reservation = makeReservation();
    const logger = makeLogger();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce({
      ...heldDeposit,
      status: "partial_refunded",
      refundAmountCents: null,
    } as never);

    const result = await recordNoShow(reservation, logger);

    expect(result.success).toBe(false);
    expect(depositService.refundPartial).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ depositId: "dep_1", reservationId: "res_1" }),
      expect.stringMatching(/persisted refund amount/i)
    );
  });

  it("returns success (not the ghost-state alarm) when a concurrent request already completed the whole no-show, including the status write (#5719 item 3 remainder)", async () => {
    const reservation = makeReservation();
    const logger = makeLogger();
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(heldDeposit as never);
    vi.mocked(venueService.getPolicyById).mockResolvedValueOnce(fullNoShowFeeVenuePolicy);
    vi.mocked(depositService.forfeit).mockResolvedValueOnce({
      ...heldDeposit,
      status: "forfeited",
    } as never);
    vi.mocked(reservationService.update).mockRejectedValueOnce(new Error("db conflict"));
    vi.mocked(reservationService.getById).mockResolvedValueOnce({
      ...reservation,
      status: "NO_SHOW",
    } as never);

    const result = await recordNoShow(reservation, logger);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.reservation.status).toBe("NO_SHOW");
    }
    expect(logger.error).not.toHaveBeenCalled();
  });
});
