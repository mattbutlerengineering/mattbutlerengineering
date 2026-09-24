import type { Deposit } from "../generated/prisma/index.js";
import { prisma } from "./database.js";
import { StripeService } from "./stripe.js";
import { transitionDeposit, DepositTransitionError } from "./deposit-state-machine.js";
import { quoteDeposit } from "@mbe/cancellation-policy";
import type { DepositType } from "@mbe/cancellation-policy";

/**
 * The subset of {@link StripeService} that DepositService depends on. Keeping
 * this narrow (rather than depending on the whole class) makes the seam
 * explicit and lets tests inject a plain object of `vi.fn()`s instead of
 * mocking the `stripe` SDK module.
 */
export type StripePort = Pick<
  StripeService,
  | "cancelPaymentIntent"
  | "capturePaymentIntent"
  | "createPartialRefund"
  | "createCustomer"
  | "retrievePaymentIntent"
>;

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
  /**
   * Stripe PaymentIntent id, set at creation so the row is never orphaned in
   * `pending` with a null intent (which would make the `payment_intent.succeeded`
   * webhook unable to find it). Written atomically in the single create.
   *
   * Optional because the authenticated staff-deposit flow ({@link ../routes/deposits.ts})
   * records a manual deposit with no Stripe PaymentIntent. The public booking-widget
   * flow always supplies it, closing the former create → link two-write window.
   */
  stripePaymentIntentId?: string;
  /** Optional Stripe customer id, written in the same atomic create. */
  stripeCustomerId?: string;
}

/**
 * Service for deposit lifecycle management.
 * Delegates Stripe API calls to StripeService.
 * State transitions are enforced by the deposit state machine.
 */
export class DepositService {
  constructor(private readonly stripe: StripePort) {}

  /**
   * Creates a new deposit in `pending` state with its Stripe PaymentIntent id
   * already set, in a single atomic write. This eliminates the former
   * create → linkPaymentIntent two-write window that could leave the row stuck
   * in `pending` with a null intent (invisible to the succeeded webhook).
   */
  async create(options: CreateDepositOptions): Promise<Deposit> {
    return prisma.deposit.create({
      data: {
        reservationId: options.reservationId,
        amountCents: options.amountCents,
        currency: options.currency ?? "usd",
        status: "pending",
        ...(options.stripePaymentIntentId
          ? { stripePaymentIntentId: options.stripePaymentIntentId }
          : {}),
        ...(options.stripeCustomerId ? { stripeCustomerId: options.stripeCustomerId } : {}),
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
   *
   * Atomic compare-and-swap: only writes if the row is still `pending` when
   * the update runs. Without this guard, a Stripe `payment_intent.succeeded`
   * webhook delivered twice (Stripe retries on non-2xx) could re-transition
   * an already-held (or already-refunded) deposit back to `held`. A racing
   * call gets `count === 0` and returns `false` — the caller treats that as
   * an idempotent no-op rather than an error.
   */
  async hold(depositId: string, stripePaymentIntentId: string): Promise<boolean> {
    const deposit = await this._requireDeposit(depositId);
    transitionDeposit(deposit.status, "held"); // throws if invalid

    const { count } = await prisma.deposit.updateMany({
      where: { id: depositId, status: "pending" },
      data: {
        status: "held",
        stripePaymentIntentId,
        heldAt: new Date(),
      },
    });

    return count > 0;
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
   * Transitions deposit from `held` → `uncollectable` with NO Stripe call.
   * Used when a capture attempt fails permanently (e.g. Stripe auto-canceled
   * the authorization after ~7 days uncaptured) — the money is gone for
   * good, so there is nothing left to reconcile against Stripe; this just
   * records that fact so the row doesn't stay stuck showing `held`.
   */
  async markUncollectable(depositId: string): Promise<Deposit> {
    const deposit = await this._requireDeposit(depositId);
    transitionDeposit(deposit.status, "uncollectable"); // throws if invalid

    const { count } = await prisma.deposit.updateMany({
      where: { id: depositId, status: deposit.status },
      data: { status: "uncollectable", uncollectableAt: new Date() },
    });

    if (count === 0) {
      throw new DepositConcurrentUpdateError(depositId, "markUncollectable");
    }

    return this._requireDeposit(depositId);
  }

  /**
   * Transitions deposit from `held` → `refunded`.
   * Cancels the Stripe PaymentIntent (releases the authorization).
   *
   * DB-first with a Stripe idempotency key; rolls back to `held` if the Stripe
   * cancel fails after the DB write.
   *
   * `skipStripeCancel` is for the Stripe-initiated path
   * (`payment_intent.canceled` webhook): the intent is already canceled on
   * Stripe's side (that is the event), so calling cancelPaymentIntent again
   * would fail against an already-canceled intent.
   */
  async refund(depositId: string, options: { skipStripeCancel?: boolean } = {}): Promise<Deposit> {
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

    if (deposit.stripePaymentIntentId && !options.skipStripeCancel) {
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
    let didTransition = false;
    if (deposit.status !== "partial_refunded") {
      transitionDeposit(deposit.status, "partial_refunded"); // throws if invalid

      const feeAmountCents = deposit.amountCents - refundAmountCents;

      // Atomic compare-and-swap: only update if the row is still in the observed
      // status. count === 0 means another concurrent transition won the race.
      const { count } = await prisma.deposit.updateMany({
        where: { id: depositId, status: deposit.status },
        data: {
          status: "partial_refunded",
          refundedAt: new Date(),
          feeAmountCents,
          refundAmountCents,
        },
      });

      if (count === 0) {
        throw new DepositConcurrentUpdateError(depositId, "refundPartial");
      }

      // Fetch the updated row to return consistent state.
      updated = await this._requireDeposit(depositId);
      didTransition = true;
    }

    if (deposit.stripePaymentIntentId) {
      const captureKey = `${depositId}:refundPartial`;
      const refundKey = `${depositId}:refundPartial:refund`;

      // Capture the full hold first. If this fails, verify via retrieve and
      // reconcile (roll back / write off / keep) through the same helper
      // `apply`/`forfeit` use (#5719 M3) — never trust the error's own
      // retriable classification.
      try {
        await this.stripe.capturePaymentIntent(deposit.stripePaymentIntentId, captureKey);
      } catch (error) {
        // Only reconcile if THIS invocation transitioned the row. On a
        // re-entrant retry (already `partial_refunded`), the card was
        // captured on the first attempt — touching the row here would
        // corrupt state (e.g. roll back a held row while the card is
        // actually captured). The same idempotency key makes the capture
        // retry safe without any DB reconciliation on this invocation.
        // If Stripe confirms the capture actually landed, fall through to the
        // refund leg — throwing here would leave the row `partial_refunded`
        // with the guest's remainder never sent.
        const captured =
          didTransition &&
          (await this._reconcileCaptureFailure(
            depositId,
            deposit.stripePaymentIntentId,
            "refundedAt",
            error
          ));
        if (!captured) throw error;
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
        await this._reconcileCaptureFailure(
          depositId,
          deposit.stripePaymentIntentId,
          timestampField,
          error
        );
        throw error;
      }
    }

    return updated;
  }

  /**
   * Reconciles a capture-transition row after a capture call throws, by
   * asking Stripe for the PaymentIntent's real status rather than trusting
   * the thrown error's retriable/non-retriable classification — a
   * non-retriable error (e.g. `StripeAuthenticationError`, or the
   * `sk_test_placeholder` fallback key) does not by itself prove the capture
   * never reached Stripe's network, and a retriable one does not prove it
   * did (#5719 H2). Always verifies via `retrievePaymentIntent` and maps the
   * ACTUAL status:
   *
   *  - `requires_capture` — confirmed: the capture never landed. Roll the
   *    row back to `held` so the whole action is retryable.
   *  - `canceled` — the authorization died (e.g. Stripe auto-canceled it
   *    after ~7 days uncaptured) before this capture could land. Nothing was
   *    ever charged and nothing ever will be: write the row off as
   *    `uncollectable` directly (bypassing the state machine, the same way
   *    {@link _rollbackToHeld} does — `uncollectable` is normally only
   *    reachable from `held`, not from the optimistic terminal status this
   *    row currently sits at).
   *  - `succeeded` (the charge actually went through — the failure was
   *    purely in receiving our own response) or any other, unrecognized
   *    status — both leave the row exactly as the DB-first write already
   *    left it. Never guess at a state change Stripe hasn't confirmed.
   *
   * Returns `true` only when Stripe confirms `succeeded` (the capture really
   * landed), so a multi-leg caller like {@link refundPartial} can still run
   * its follow-up refund leg; callers otherwise rethrow the ORIGINAL capture
   * error so the failure stays visible. If the verification retrieve itself
   * throws, none of the above can be determined — rethrow the original error
   * immediately rather than masking it with a retrieve-specific one, and
   * leave the row untouched.
   */
  private async _reconcileCaptureFailure(
    depositId: string,
    stripePaymentIntentId: string,
    timestampField: "appliedAt" | "refundedAt" | "forfeitedAt",
    error: unknown
  ): Promise<boolean> {
    let intent: { status: string };
    try {
      intent = await this.stripe.retrievePaymentIntent(stripePaymentIntentId);
    } catch {
      throw error;
    }

    if (intent.status === "requires_capture") {
      await this._rollbackToHeld(depositId, timestampField).catch(() => {});
    } else if (intent.status === "canceled") {
      await this._writeOffUncollectable(depositId, timestampField).catch(() => {});
    }

    return intent.status === "succeeded";
  }

  /**
   * Writes a deposit off as `uncollectable` after a capture attempt confirms
   * the authorization is permanently dead, bypassing the state machine (the
   * row is currently at an optimistic terminal status, e.g. `forfeited`, not
   * `held`) the same way {@link _rollbackToHeld} does.
   */
  private async _writeOffUncollectable(
    depositId: string,
    timestampField: "appliedAt" | "refundedAt" | "forfeitedAt"
  ): Promise<void> {
    await prisma.deposit.update({
      where: { id: depositId },
      data: { status: "uncollectable", uncollectableAt: new Date(), [timestampField]: null },
    });
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

// Singleton. StripeService construction happens here, at the composition
// root — DepositService itself only ever depends on the narrower StripePort.
export const depositService = new DepositService(
  new StripeService(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder")
);

// Re-export error class from state machine for convenience
export { DepositTransitionError };

/**
 * Calculates the deposit amount in cents for a reservation.
 *
 * Delegates to the shared {@link quoteDeposit} pricing rule in
 * `@mbe/cancellation-policy` — the same function the booking widget calls to
 * display the amount, so the guest never sees a different number than what
 * Stripe authorizes.
 *
 * `venue.depositType` is typed loosely (`string | null`) here to match the
 * Prisma-raw venue shape callers pass in; the DB column is a Postgres enum
 * (`flat` | `per_person`) so the cast below is safe for real data.
 */
export function calculateDepositAmount(
  venue: { depositType: string | null; depositAmountCents: number | null },
  partySize: number
): number {
  return quoteDeposit(
    { depositType: venue.depositType as DepositType | null, amountCents: venue.depositAmountCents },
    partySize
  );
}
