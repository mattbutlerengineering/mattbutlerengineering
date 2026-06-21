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

    const updated = await prisma.deposit.update({
      where: { id: depositId },
      data: { status: "refunded", refundedAt: new Date() },
    });

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
   * Transitions deposit from `held` → `refunded` with a partial Stripe refund.
   * Captures the PaymentIntent for the fee amount, then issues a partial refund
   * for the remainder. Used for late cancellations.
   */
  async refundPartial(depositId: string, refundAmountCents: number): Promise<Deposit> {
    const deposit = await this._requireDeposit(depositId);
    transitionDeposit(deposit.status, "refunded"); // throws if invalid

    if (deposit.stripePaymentIntentId) {
      // Capture the full hold first so we can then partially refund
      await this.stripe.capturePaymentIntent(deposit.stripePaymentIntentId);
      // Refund only the portion that should go back to the guest
      if (refundAmountCents > 0) {
        await this.stripe.createPartialRefund(deposit.stripePaymentIntentId, refundAmountCents);
      }
    }

    return prisma.deposit.update({
      where: { id: depositId },
      data: {
        status: "refunded",
        refundedAt: new Date(),
      },
    });
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

    const updated = await prisma.deposit.update({
      where: { id: depositId },
      data: { status: targetStatus, [timestampField]: new Date() },
    });

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
