import type { Deposit } from "../generated/prisma/index.js";
import { prisma } from "./database.js";
import { StripeService } from "./stripe.js";
import { transitionDeposit, DepositTransitionError } from "./deposit-state-machine.js";

export class DepositNotFoundError extends Error {
  constructor(id: string) {
    super(`Deposit not found: ${id}`);
    this.name = "DepositNotFoundError";
  }
}

export class DepositConcurrentUpdateError extends Error {
  constructor(id: string, action: string) {
    super(
      `Deposit ${id} concurrent update conflict: lost race on ${action}. Another transition completed first.`
    );
    this.name = "DepositConcurrentUpdateError";
  }
}

export interface CreateDepositOptions {
  reservationId: string;
  amountCents: number;
  currency?: string;
}

/**
 * Service for deposit lifecycle management.
 * Delegates Stripe API calls to StripeService.
 * State transitions are enforced by the deposit state machine.
 */
export class DepositService {
  private readonly stripe: StripeService;

  constructor(stripeApiKey: string) {
    this.stripe = new StripeService(stripeApiKey);
  }

  /**
   * Creates a new deposit in `pending` state.
   */
  async create(options: CreateDepositOptions): Promise<Deposit> {
    return prisma.deposit.create({
      data: {
        reservationId: options.reservationId,
        amountCents: options.amountCents,
        currency: options.currency ?? "usd",
        status: "pending",
      },
    });
  }

  /**
   * Retrieves a deposit by its ID.
   */
  async getById(id: string): Promise<Deposit | null> {
    return prisma.deposit.findUnique({ where: { id } });
  }

  /**
   * Retrieves a deposit by the associated reservation ID.
   */
  async getByReservationId(reservationId: string): Promise<Deposit | null> {
    return prisma.deposit.findUnique({ where: { reservationId } });
  }

  /**
   * Retrieves a deposit by the Stripe PaymentIntent ID.
   */
  async getByPaymentIntentId(stripePaymentIntentId: string): Promise<Deposit | null> {
    return prisma.deposit.findFirst({ where: { stripePaymentIntentId } });
  }

  /**
   * Links a Stripe PaymentIntent to a pending deposit.
   * Called immediately after creating the PaymentIntent so the webhook can find it.
   */
  async linkPaymentIntent(
    depositId: string,
    stripePaymentIntentId: string,
    stripeCustomerId?: string
  ): Promise<Deposit> {
    return prisma.deposit.update({
      where: { id: depositId },
      data: {
        stripePaymentIntentId,
        ...(stripeCustomerId ? { stripeCustomerId } : {}),
      },
    });
  }

  /**
   * Transitions deposit from `pending` → `held`.
   * Called after Stripe confirms the PaymentIntent is authorized.
   */
  async hold(depositId: string, stripePaymentIntentId: string): Promise<Deposit> {
    const deposit = await this._requireDeposit(depositId);
    transitionDeposit(deposit.status, "held"); // throws if invalid

    return prisma.deposit.update({
      where: { id: depositId },
      data: {
        status: "held",
        stripePaymentIntentId,
        heldAt: new Date(),
      },
    });
  }

  /**
   * Transitions deposit from `held` → `applied`.
   * Captures the Stripe PaymentIntent (charges the card).
   *
   * DB-first: the status row moves to `applied` before Stripe is called, so a
   * DB failure never leaves a charged card with a `held` row. The Stripe call
   * uses an idempotency key so retries don't double-capture. If Stripe fails
   * after the DB write, the row is rolled back to `held` (retryable).
   */
  async apply(depositId: string): Promise<Deposit> {
    return this._captureAndTransition(depositId, "applied", "appliedAt", "apply");
  }

  /**
   * Transitions deposit from `held` → `refunded`.
   * Cancels the Stripe PaymentIntent (releases the authorization).
   *
   * DB-first with a Stripe idempotency key; rolls back to `held` if the Stripe
   * cancel fails after the DB write.
   */
  async refund(depositId: string): Promise<Deposit> {
    const deposit = await this._requireDeposit(depositId);
    transitionDeposit(deposit.status, "refunded"); // throws if invalid

    // Atomic compare-and-swap: only update if the row is still in the observed
    // status. count === 0 means another concurrent transition won the race.
    const { count } = await prisma.deposit.updateMany({
      where: { id: depositId, status: deposit.status },
      data: { status: "refunded", refundedAt: new Date() },
    });

    if (count === 0) {
      throw new DepositConcurrentUpdateError(depositId, "refund");
    }

    // Fetch the updated row to return consistent state.
    const updated = await this._requireDeposit(depositId);

    if (deposit.stripePaymentIntentId) {
      try {
        await this.stripe.cancelPaymentIntent(deposit.stripePaymentIntentId, `${depositId}:refund`);
      } catch (error) {
        // Best-effort rollback. If the rollback itself fails (e.g. DB down),
        // surface the original Stripe error rather than masking it — never
        // swallow the cause of the failure.
        await this._rollbackToHeld(depositId, "refundedAt").catch(() => {});
        throw error;
      }
    }

    return updated;
  }

  /**
   * Transitions deposit from `held` → `partial_refunded` with a partial Stripe
   * refund. This is a two-step Stripe mutation: capture the PaymentIntent
   * (charges the deposit), then refund the portion owed back to the guest. Used
   * for late cancellations and partial no-show fees.
   *
   * Money-safety contract (a two-step flow needs more than the single-call
   * {@link _captureAndTransition} pattern):
   *
   *  - DB-first: the row moves to `partial_refunded` before Stripe is called, so
   *    a DB failure never leaves a charged card with a stale `held` row.
   *  - Distinct idempotency keys per Stripe endpoint guarantee a retry can never
   *    return one call's cached response for the other.
   *  - If the CAPTURE fails, no money moved — roll the row back to `held` so the
   *    whole action is cleanly retryable.
   *  - If the capture SUCCEEDS but the REFUND fails, money has been captured.
   *    Rolling back to `held` would be a lie (the card is charged) and a retry
   *    would re-capture and fail. Instead the row stays `partial_refunded` and
   *    the error is surfaced; the operation is idempotently retryable end-to-end
   *    (re-running replays the cached capture and completes the refund via its
   *    idempotency key) without ever double-charging.
   *  - Re-entrant: a deposit already in `partial_refunded` (a retry after a
   *    refund failure) skips the transition/DB write and just replays the Stripe
   *    steps.
   */
  async refundPartial(depositId: string, refundAmountCents: number): Promise<Deposit> {
    const deposit = await this._requireDeposit(depositId);

    // Validate at the trust boundary — never refund more than was deposited,
    // and reject negatives. (Zero is allowed: a 100%-fee partial still captures.)
    if (refundAmountCents < 0 || refundAmountCents > deposit.amountCents) {
      throw new Error(
        `Invalid partial refund amount ${refundAmountCents} for deposit ${depositId} (deposit is ${deposit.amountCents} cents)`
      );
    }

    // Re-entry guard: a retry after a refund failure arrives already in
    // `partial_refunded`. Only transition + write the row when coming from `held`.
    let updated = deposit;
    if (deposit.status !== "partial_refunded") {
      transitionDeposit(deposit.status, "partial_refunded"); // throws if invalid

      // Atomic compare-and-swap: only update if the row is still in the observed
      // status. count === 0 means another concurrent transition won the race.
      const { count } = await prisma.deposit.updateMany({
        where: { id: depositId, status: deposit.status },
        data: { status: "partial_refunded", refundedAt: new Date() },
      });

      if (count === 0) {
        throw new DepositConcurrentUpdateError(depositId, "refundPartial");
      }

      // Fetch the updated row to return consistent state.
      updated = await this._requireDeposit(depositId);
    }

    if (deposit.stripePaymentIntentId) {
      const captureKey = `${depositId}:refundPartial`;
      const refundKey = `${depositId}:refundPartial:refund`;

      // Capture the full hold first. If this fails, no money has moved, so roll
      // the row back to `held` — the action is cleanly retryable.
      try {
        await this.stripe.capturePaymentIntent(deposit.stripePaymentIntentId, captureKey);
      } catch (error) {
        await this._rollbackToHeld(depositId, "refundedAt").catch(() => {});
        throw error;
      }

      // Refund the guest's portion. The card is now captured; a failure here
      // must NOT roll back to `held` (that would re-capture on retry). Surface
      // the error and leave the row `partial_refunded` — retry is idempotent.
      if (refundAmountCents > 0) {
        await this.stripe.createPartialRefund(
          deposit.stripePaymentIntentId,
          refundAmountCents,
          refundKey
        );
      }
    }

    return updated;
  }

  /**
   * Transitions deposit from `held` → `forfeited`.
   * Captures the Stripe PaymentIntent (charges the card as forfeit).
   *
   * DB-first with a Stripe idempotency key; rolls back to `held` if the Stripe
   * capture fails after the DB write.
   */
  async forfeit(depositId: string): Promise<Deposit> {
    return this._captureAndTransition(depositId, "forfeited", "forfeitedAt", "forfeit");
  }

  /**
   * Shared DB-first capture flow for the two capture-based transitions
   * (`apply` and `forfeit`). Updates the DB status first, then captures the
   * Stripe PaymentIntent with an idempotency key, rolling the DB back to `held`
   * if Stripe fails after the write.
   */
  private async _captureAndTransition(
    depositId: string,
    targetStatus: "applied" | "forfeited",
    timestampField: "appliedAt" | "forfeitedAt",
    action: string
  ): Promise<Deposit> {
    const deposit = await this._requireDeposit(depositId);
    transitionDeposit(deposit.status, targetStatus); // throws if invalid

    // Atomic compare-and-swap: only update if the row is still in the observed
    // status. count === 0 means another concurrent transition won the race.
    const { count } = await prisma.deposit.updateMany({
      where: { id: depositId, status: deposit.status },
      data: { status: targetStatus, [timestampField]: new Date() },
    });

    if (count === 0) {
      throw new DepositConcurrentUpdateError(depositId, action);
    }

    // Fetch the updated row to return consistent state.
    const updated = await this._requireDeposit(depositId);

    if (deposit.stripePaymentIntentId) {
      try {
        await this.stripe.capturePaymentIntent(
          deposit.stripePaymentIntentId,
          `${depositId}:${action}`
        );
      } catch (error) {
        // Best-effort rollback. If the rollback itself fails (e.g. DB down),
        // surface the original Stripe error rather than masking it — never
        // swallow the cause of the failure.
        await this._rollbackToHeld(depositId, timestampField).catch(() => {});
        throw error;
      }
    }

    return updated;
  }

  /**
   * Rolls a deposit back to `held` after a Stripe failure, clearing the
   * transition timestamp so the row stays consistent and the action is
   * retryable.
   */
  private async _rollbackToHeld(
    depositId: string,
    timestampField: "appliedAt" | "refundedAt" | "forfeitedAt"
  ): Promise<void> {
    await prisma.deposit.update({
      where: { id: depositId },
      data: { status: "held", [timestampField]: null },
    });
  }

  /**
   * Ensures or creates a Stripe customer for a guest.
   * Returns the Stripe customer ID.
   */
  async ensureStripeCustomer(guestId: string, email?: string, name?: string): Promise<string> {
    const guest = await prisma.guest.findUnique({ where: { id: guestId } });

    if (guest?.stripeCustomerId) {
      return guest.stripeCustomerId;
    }

    const customer = await this.stripe.createCustomer({
      email,
      name,
      metadata: { guestId },
    });

    await prisma.guest.update({
      where: { id: guestId },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  private async _requireDeposit(id: string): Promise<Deposit> {
    const deposit = await prisma.deposit.findUnique({ where: { id } });
    if (!deposit) {
      throw new DepositNotFoundError(id);
    }
    return deposit;
  }
}

// Singleton
export const depositService = new DepositService(
  process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder"
);

// Re-export error class from state machine for convenience
export { DepositTransitionError };

/**
 * Pure function: calculates the deposit amount in cents for a reservation.
 *
 * Rules:
 * - "per_person": amount × partySize
 * - "fixed" (or any other type): amount as-is
 * - null depositAmountCents: zero
 */
export function calculateDepositAmount(
  venue: { depositType: string | null; depositAmountCents: number | null },
  partySize: number
): number {
  const amount = venue.depositAmountCents ?? 0;
  if (venue.depositType === "per_person") {
    return amount * partySize;
  }
  return amount;
}
