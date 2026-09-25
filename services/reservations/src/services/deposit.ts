import type { Deposit } from "../generated/prisma/index.js";
import { prisma } from "./database.js";
import { StripeService, StripeOperationError } from "./stripe.js";
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
  | "findDepositRefund"
>;

/**
 * Narrow logger shape `_reconcileCaptureFailure`/CAS-guard writes need —
 * satisfied by `FastifyBaseLogger`. Defaults to a no-op so importing this
 * module never requires a logger to exist yet (module load order, unit
 * tests); `app.ts` wires the real fastify/pino logger in at bootstrap via
 * {@link setDepositServiceLogger}, mirroring `rls-context-mode.ts`'s
 * tripwire-logger pattern.
 */
export interface DepositServiceLogger {
  error(details: object, msg: string): void;
}

let logger: DepositServiceLogger = { error: () => undefined };

/**
 * Stripe error types specific enough to PROVE a capture attempt never
 * reached a chargeable state — the only types safe to combine with a
 * `requires_capture`/`canceled` retrieve result to roll back or write off a
 * row. Any other failure (a dropped connection, a generic API error, a rate
 * limit) leaves open the possibility the capture is still in flight or
 * already landed, so it must never drive a state change on its own — a
 * mistaken rollback there risks a double-capture on the inevitable retry
 * (#5722 M2).
 */
const CAPTURE_NEVER_HAPPENED_STRIPE_TYPES = new Set([
  "StripeInvalidRequestError",
  "StripeCardError",
  "StripeAuthenticationError",
  "StripePermissionError",
]);

/** Wires the service's real logger in — called once at app bootstrap. */
export function setDepositServiceLogger(next: DepositServiceLogger): void {
  logger = next;
}

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

/**
 * `refundPartial`'s REFUND leg failed after its CAPTURE leg already
 * succeeded — the guest's card has been charged in full but the promised
 * refund never went out. Thrown as a distinct type (never the raw Stripe
 * error) so callers can never mistake this for a fully-resolved operation
 * just because the row's `status` already reads `partial_refunded` — that
 * field is written DB-first, before either Stripe call, so it matches the
 * target status regardless of whether the refund leg ever ran (#5722 H1).
 * The row is deliberately left at `partial_refunded` (never rolled back —
 * the card IS charged); a retry replays only the refund leg, since the
 * capture is a re-entrant, idempotency-keyed no-op.
 */
export class DepositRefundLegIncompleteError extends Error {
  readonly depositId: string;
  override readonly cause: unknown;

  constructor(depositId: string, cause: unknown) {
    super(`Deposit ${depositId} refund leg failed after its capture leg already succeeded`);
    this.name = "DepositRefundLegIncompleteError";
    this.depositId = depositId;
    this.cause = cause;
  }
}

/**
 * A capture attempt failed and Stripe's PaymentIntent status could not be
 * confirmed as either resolved (`succeeded`) or proven never-to-have-happened
 * (`requires_capture`/`canceled`, verified via an error type that rules out
 * an in-flight request) — e.g. a `StripeConnectionError` where the capture
 * may still land moments later, or a non-terminal status like `processing`/
 * `requires_action`. The row is deliberately left untouched at its
 * optimistic target status (never guessed at), but this is NOT a confirmed
 * success: callers must never treat this the same as a verified `succeeded`
 * (#5722 M2, M3).
 */
export class DepositCaptureAmbiguousError extends Error {
  readonly depositId: string;
  readonly intentStatus: string;
  override readonly cause: unknown;

  constructor(depositId: string, intentStatus: string, cause: unknown) {
    super(
      `Deposit ${depositId} capture failed and Stripe's PaymentIntent status (${intentStatus}) is not confirmed`
    );
    this.name = "DepositCaptureAmbiguousError";
    this.depositId = depositId;
    this.intentStatus = intentStatus;
    this.cause = cause;
  }
}

/**
 * A re-entrant retry (`refundPartial`'s capture-leg pre-check, or
 * {@link DepositService.verifyCaptureCompleted}) confirmed the underlying
 * PaymentIntent is `canceled` — the authorization died (e.g. Stripe
 * auto-canceled it after ~7 days uncaptured) before this deposit's capture
 * ever landed. Nothing was ever charged and nothing ever will be: the row
 * has been written off as `uncollectable`. Callers should report this as
 * resolved with no fee collected, never as a failure (#5722 R5 LOW-2).
 */
export class DepositWrittenOffUncollectableError extends Error {
  readonly depositId: string;

  constructor(depositId: string) {
    super(
      `Deposit ${depositId} was written off as uncollectable — its authorization was canceled before capture`
    );
    this.name = "DepositWrittenOffUncollectableError";
    this.depositId = depositId;
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
        await this._rollbackToHeld(depositId, "refunded", "refundedAt").catch(() => {});
        throw error;
      }
    }

    return updated;
  }

  /**
   * Transitions deposit from `held` → `uncollectable` when Stripe cancels the
   * authorization itself — e.g. the ~7-day hold auto-expired, or a dashboard
   * cancel — before any capture was attempted. This is the SAME "authorization
   * died before we could act" condition the no-show/forfeit capture-failure
   * path already reaches via `_reconcileCaptureFailure`/`verifyCaptureCompleted`,
   * which write the row off as `uncollectable`; this webhook-first path used to
   * call {@link refund} instead, landing the identical scenario at `refunded` —
   * a label that wrongly implies an active refund decision rather than a dead,
   * uncollectable authorization. Unifies both paths on `uncollectable`
   * (#5725 item 3). No Stripe call is made: the intent is already canceled on
   * Stripe's side (that is the event that triggers this).
   */
  async expireAuthorization(depositId: string): Promise<Deposit> {
    const deposit = await this._requireDeposit(depositId);
    transitionDeposit(deposit.status, "uncollectable"); // throws if invalid

    // Atomic compare-and-swap: only update if the row is still in the observed
    // status. count === 0 means another concurrent transition won the race.
    const { count } = await prisma.deposit.updateMany({
      where: { id: depositId, status: deposit.status },
      data: { status: "uncollectable", uncollectableAt: new Date() },
    });

    if (count === 0) {
      throw new DepositConcurrentUpdateError(depositId, "expireAuthorization");
    }

    return this._requireDeposit(depositId);
  }

  /**
   * Reconciles a `charge.refunded` webhook against a deposit that already
   * reached a capture-based terminal status (`applied`/`forfeited`/
   * `partial_refunded`) — e.g. a refund issued through the Stripe dashboard
   * after our own capture. Persists Stripe's own cumulative `amount_refunded`
   * on the charge directly — never derives it — so a retried or duplicate
   * webhook delivery naturally overwrites with the same (or a larger,
   * still-accurate) cumulative value rather than double-counting (#5725 item 2).
   * Deliberately does not move `status`: this is a reconciliation annotation on
   * an already-terminal state, not a new transition for the state machine to
   * reason about.
   */
  async recordPostCaptureRefund(depositId: string, amountRefundedCents: number): Promise<Deposit> {
    await prisma.deposit.update({
      where: { id: depositId },
      data: { postCaptureRefundCents: amountRefundedCents },
    });
    return this._requireDeposit(depositId);
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
   *  - A REFUND-leg failure (capture succeeded, refund threw) is surfaced as
   *    a distinct {@link DepositRefundLegIncompleteError} — never the raw
   *    Stripe error — so callers can never mistake the row's DB-first
   *    `partial_refunded` status for proof the refund actually went out
   *    (#5722 H1).
   *  - On a re-entrant retry, Stripe's idempotency keys have a ~24h TTL:
   *    past that window, replaying the capture call against an intent that
   *    already moved to `succeeded` fails with `payment_intent_unexpected_state`
   *    instead of returning the cached response, and replaying the refund
   *    call could otherwise double-refund. Both Stripe calls are guarded on
   *    retry by checking ground truth (retrieve / already-refunded amount)
   *    first and skipping the call when it's already done (#5722 H2).
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

      // On a re-entrant retry, verify ground truth before replaying either
      // Stripe call — the idempotency keys above are only guaranteed valid
      // for ~24h, and replaying a capture against an intent that already
      // moved to `succeeded` fails with `payment_intent_unexpected_state`
      // rather than returning the cached response (#5722 H2).
      let captureConfirmedSucceeded = false;
      let preCheckIntentStatus: string | null = null;
      if (!didTransition) {
        try {
          const intent = await this.stripe.retrievePaymentIntent(deposit.stripePaymentIntentId);
          preCheckIntentStatus = intent.status;
          captureConfirmedSucceeded = intent.status === "succeeded";
        } catch {
          // Can't verify — fall through and let the capture call itself
          // surface whatever Stripe says (the idempotency key may still be
          // valid).
        }

        if (preCheckIntentStatus === "canceled") {
          // The authorization died before this row's capture ever landed —
          // nothing was ever charged and nothing ever will be. Write off
          // rather than attempting a doomed capture replay (#5722 R5 LOW-2).
          await this._writeOffUncollectable(depositId, "partial_refunded", "refundedAt").catch(
            () => {}
          );
          throw new DepositWrittenOffUncollectableError(depositId);
        }
      }

      // Capture the full hold first. If this fails, verify via retrieve and
      // reconcile (roll back / write off / keep) through the same helper
      // `apply`/`forfeit` use (#5719 M3) — never trust the error's own
      // retriable classification.
      if (!captureConfirmedSucceeded) {
        try {
          await this.stripe.capturePaymentIntent(deposit.stripePaymentIntentId, captureKey);
        } catch (error) {
          // Only reconcile if THIS invocation transitioned the row. On a
          // re-entrant retry (already `partial_refunded`), the card was
          // captured on the first attempt — touching the row here would
          // corrupt state (e.g. roll back a held row while the card is
          // actually captured). The same idempotency key makes the capture
          // retry safe without any DB reconciliation on this invocation.
          //
          // If `_reconcileCaptureFailure` confirms the capture actually
          // landed despite the thrown error (a dropped connection after the
          // request reached Stripe), fall through to the refund leg below
          // instead of rethrowing — rethrowing here would leave the row
          // `partial_refunded` with the guest's remainder never sent, a gap
          // in the original H1/H2 fixes (stripe-flow-reviewer addendum).
          if (didTransition) {
            captureConfirmedSucceeded = await this._reconcileCaptureFailure(
              depositId,
              deposit.stripePaymentIntentId,
              "partial_refunded",
              "refundedAt",
              error
            );
          }
          if (!captureConfirmedSucceeded) {
            if (didTransition) {
              throw error;
            }
            // Re-entrant retry (!didTransition): a PRIOR invocation already
            // wrote this row to partial_refunded DB-first, which structurally
            // rules out "capture never happened" — a confirmed never-happened
            // case would already have been rolled back to `held` by that
            // prior invocation's own reconciliation. So this replay failure
            // can only mean ambiguous or already-succeeded-elsewhere, never
            // "nothing was charged". Throwing the raw error here previously
            // surfaced a misleading "could not process the deposit" message
            // even though the card was almost certainly already charged
            // (#5722 R4 LOW-1).
            throw new DepositCaptureAmbiguousError(
              depositId,
              preCheckIntentStatus ?? "unknown",
              error
            );
          }
        }
      }

      // Refund the guest's portion. The card is now captured; a failure here
      // must NOT roll back to `held` (that would re-capture on retry). Surface
      // a distinct error and leave the row `partial_refunded` — retry is
      // idempotent (#5722 H1).
      if (refundAmountCents > 0) {
        let ourRefundAmountCents = 0;
        if (!didTransition) {
          // Same TTL concern as the capture leg above: a replayed refund call
          // past the key's expiry could otherwise double-refund (#5722 H2).
          // If ground truth itself can't be verified, fail CLOSED rather than
          // assuming "not yet refunded" and replaying — that default risks a
          // double refund past the TTL, so the verify failure is surfaced as
          // its own incomplete-leg error and createPartialRefund is never
          // called on this path (#5722 R4 HIGH-1).
          try {
            const ourRefund = await this.stripe.findDepositRefund(
              deposit.stripePaymentIntentId,
              depositId
            );
            ourRefundAmountCents = ourRefund?.amount ?? 0;
          } catch (error) {
            throw new DepositRefundLegIncompleteError(depositId, error);
          }
        }

        if (ourRefundAmountCents < refundAmountCents) {
          try {
            await this.stripe.createPartialRefund(
              deposit.stripePaymentIntentId,
              refundAmountCents,
              depositId,
              refundKey
            );
          } catch (error) {
            throw new DepositRefundLegIncompleteError(depositId, error);
          }
        }
      }
    }

    return updated;
  }

  /**
   * Re-verifies a deposit ALREADY sitting at a capture-based terminal status
   * (`forfeited`/`applied`) whose underlying Stripe capture was never
   * confirmed. `_reconcileCaptureFailure` can leave a row at exactly this
   * optimistic status without proof — the {@link DepositCaptureAmbiguousError}
   * case (#5722 M3) — so a later retry (staff re-attempting a no-show or
   * cancellation) must not trust that DB status alone before writing a final
   * reservation status on top of it; an unconfirmed or dead capture would
   * otherwise become a ghost charge no webhook or future retry can ever catch
   * (#5722 R4 MED-1). Re-derives ground truth from Stripe directly:
   *
   *  - `succeeded` — the capture landed; nothing further to do.
   *  - `canceled` — the authorization died before anything captured; nothing
   *    was ever charged and nothing ever will be. Write the row off as
   *    `uncollectable` rather than failing forever (#5722 R5 LOW-2).
   *  - `requires_capture` — nothing was ever charged. Re-capturing here
   *    charges money, so it is ONLY safe when `allowRecapture` is true AND
   *    `fromStatus` is `forfeited` — the single case where the retry is
   *    provably the SAME operation that produced this status (a no-show
   *    retry replaying its own `${depositId}:forfeit` key; forfeit always
   *    means "capture the full deposit", so there is no policy this retry
   *    could get wrong). Every other case — ANY cancel (staff waives fees
   *    and refunds in full; a free-window guest cancel refunds in full; a
   *    guest cancel past the boundary may only owe a partial fee) touching a
   *    `forfeited` row, or ANY retry touching an `applied` row (only ever set
   *    by the separate staff `/deposits/:id/capture` route, never by a
   *    no-show or cancel) — would charge money a policy this retry isn't
   *    itself evaluating actually called for (#5722 R5 MED-1, re-opens the
   *    #5719 item-6 partial-fee guarantee if violated). CAS-roll the row back
   *    to `held` instead, so the caller can re-derive the correct action from
   *    a clean slate.
   *  - anything else (a non-terminal status, the re-capture itself throwing,
   *    or the verification retrieve itself throwing) is never guessed at —
   *    fails closed so the caller aborts rather than reporting a completion
   *    Stripe never confirmed.
   *
   * A deposit with no `stripePaymentIntentId` (a manual, non-Stripe deposit)
   * has nothing to verify against Stripe and is reported `succeeded` outright.
   */
  async verifyCaptureCompleted(
    depositId: string,
    fromStatus: "applied" | "forfeited",
    timestampField: "appliedAt" | "forfeitedAt",
    allowRecapture: boolean
  ): Promise<"succeeded" | "recaptured" | "rolled-back-to-held" | "uncollectable" | "failed"> {
    const deposit = await this._requireDeposit(depositId);
    if (!deposit.stripePaymentIntentId) {
      return "succeeded";
    }

    let intent: { status: string };
    try {
      intent = await this.stripe.retrievePaymentIntent(deposit.stripePaymentIntentId);
    } catch {
      return "failed";
    }

    if (intent.status === "succeeded") {
      return "succeeded";
    }

    if (intent.status === "canceled") {
      await this._writeOffUncollectable(depositId, fromStatus, timestampField).catch(() => {});
      return "uncollectable";
    }

    if (intent.status === "requires_capture") {
      if (allowRecapture && fromStatus === "forfeited") {
        try {
          await this.stripe.capturePaymentIntent(
            deposit.stripePaymentIntentId,
            `${depositId}:forfeit`
          );
          return "recaptured";
        } catch {
          return "failed";
        }
      }
      await this._rollbackToHeld(depositId, fromStatus, timestampField).catch(() => {});
      return "rolled-back-to-held";
    }

    return "failed";
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
          targetStatus,
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
   * did (#5719 H2). Verifies via `retrievePaymentIntent`, but a confirmed
   * `requires_capture`/`canceled` status is only acted on when the THROWN
   * ERROR also proves no capture happened — a connection/timeout-class
   * error never does, since the request may still be in flight and could
   * land moments later (#5722 M2):
   *
   *  - `requires_capture`, with an error proving no-capture (e.g.
   *    `StripeInvalidRequestError`, `StripeCardError`, an auth error) —
   *    confirmed: the capture never landed. Roll the row back to `held` so
   *    the whole action is retryable.
   *  - `canceled`, with the same class of proving error — the authorization
   *    died (e.g. Stripe auto-canceled it after ~7 days uncaptured) before
   *    this capture could land. Nothing was ever charged and nothing ever
   *    will be: write the row off as `uncollectable` directly (bypassing the
   *    state machine, the same way {@link _rollbackToHeld} does —
   *    `uncollectable` is normally only reachable from `held`, not from the
   *    optimistic terminal status this row currently sits at).
   *  - `succeeded` — confirmed: the charge actually went through (the
   *    failure was purely in receiving our own response). The row is
   *    already correct; nothing to reconcile.
   *  - Anything else — an ambiguous transport-class error (capture may
   *    still be in flight), or a status that isn't `succeeded`/
   *    `requires_capture`/`canceled` (e.g. `processing`, `requires_action`)
   *    — is never guessed at. The row is left at its optimistic status, an
   *    error-level log records the ambiguity for manual reconciliation, and
   *    a distinct {@link DepositCaptureAmbiguousError} is thrown so callers
   *    can never mistake "kept because we don't know" for "kept because
   *    Stripe confirmed it" (#5722 M3).
   *
   * Returns `true` only when Stripe confirms `succeeded` (the capture really
   * landed) — never throws in that case, so a multi-leg caller like
   * {@link refundPartial} can fall through to its own follow-up refund leg
   * instead of rethrowing and leaving the guest's remainder unrefunded.
   * Single-leg callers (`apply`/`forfeit`, via `_captureAndTransition`) still
   * rethrow the original error themselves right after calling this, since
   * they have no follow-up leg to run and must always surface the failure.
   * In every other case this throws — the ORIGINAL capture error for the
   * confirmed-rollback/write-off cases, or {@link DepositCaptureAmbiguousError}
   * for the ambiguous case — so callers can rely on "returns normally" as the
   * one unambiguous confirmed-success signal. If the verification retrieve
   * itself throws, none of the above can be determined — rethrow the
   * original error immediately rather than masking it with a
   * retrieve-specific one, and leave the row untouched.
   */
  private async _reconcileCaptureFailure(
    depositId: string,
    stripePaymentIntentId: string,
    targetStatus: "applied" | "forfeited" | "partial_refunded",
    timestampField: "appliedAt" | "refundedAt" | "forfeitedAt",
    error: unknown
  ): Promise<boolean> {
    let intent: { status: string };
    try {
      intent = await this.stripe.retrievePaymentIntent(stripePaymentIntentId);
    } catch {
      throw error;
    }

    const provesCaptureNeverHappened =
      error instanceof StripeOperationError &&
      CAPTURE_NEVER_HAPPENED_STRIPE_TYPES.has(error.stripeType);

    if (provesCaptureNeverHappened && intent.status === "requires_capture") {
      await this._rollbackToHeld(depositId, targetStatus, timestampField).catch(() => {});
      throw error;
    }

    if (provesCaptureNeverHappened && intent.status === "canceled") {
      await this._writeOffUncollectable(depositId, targetStatus, timestampField).catch(() => {});
      throw error;
    }

    if (intent.status === "succeeded") {
      return true;
    }

    logger.error(
      { depositId, targetStatus, action: timestampField, intentStatus: intent.status, err: error },
      "Deposit capture failed and Stripe's PaymentIntent status is not confirmed; row left at its optimistic status pending manual reconciliation"
    );
    throw new DepositCaptureAmbiguousError(depositId, intent.status, error);
  }

  /**
   * Writes a deposit off as `uncollectable` after a capture attempt confirms
   * the authorization is permanently dead, bypassing the state machine (the
   * row is currently at an optimistic terminal status, e.g. `forfeited`, not
   * `held`) the same way {@link _rollbackToHeld} does.
   *
   * Compare-and-swap on `fromStatus`: only writes if the row is still at the
   * status this reconciliation observed. A concurrent write beating this one
   * (count === 0) is logged rather than thrown — the caller always swallows
   * this promise's rejection (`.catch(() => {})`), so throwing here would be
   * silently discarded anyway (#5722 M1). `feeAmountCents`/`refundAmountCents`
   * are only ever set by `refundPartial`, so they're cleared here too when
   * writing off a `partial_refunded` row — otherwise they'd stay stale on a
   * deposit that never ends up charging or refunding anything (#5722 LOW).
   */
  private async _writeOffUncollectable(
    depositId: string,
    fromStatus: "applied" | "forfeited" | "partial_refunded",
    timestampField: "appliedAt" | "refundedAt" | "forfeitedAt"
  ): Promise<void> {
    const { count } = await prisma.deposit.updateMany({
      where: { id: depositId, status: fromStatus },
      data: {
        status: "uncollectable",
        uncollectableAt: new Date(),
        [timestampField]: null,
        ...(fromStatus === "partial_refunded"
          ? { feeAmountCents: null, refundAmountCents: null }
          : {}),
      },
    });

    if (count === 0) {
      logger.error(
        { depositId, fromStatus, action: "writeOffUncollectable" },
        "Deposit write-off to uncollectable lost a concurrent-update race; row was not at the expected status"
      );
    }
  }

  /**
   * Rolls a deposit back to `held` after a Stripe failure, clearing the
   * transition timestamp so the row stays consistent and the action is
   * retryable.
   *
   * Compare-and-swap on `fromStatus`, mirroring {@link _writeOffUncollectable}
   * — see its doc comment for why a lost race logs instead of throwing, and
   * why `partial_refunded` also clears the fee/refund fields (#5722 M1, LOW).
   */
  private async _rollbackToHeld(
    depositId: string,
    fromStatus: "applied" | "forfeited" | "partial_refunded" | "refunded",
    timestampField: "appliedAt" | "refundedAt" | "forfeitedAt"
  ): Promise<void> {
    const { count } = await prisma.deposit.updateMany({
      where: { id: depositId, status: fromStatus },
      data: {
        status: "held",
        [timestampField]: null,
        ...(fromStatus === "partial_refunded"
          ? { feeAmountCents: null, refundAmountCents: null }
          : {}),
      },
    });

    if (count === 0) {
      logger.error(
        { depositId, fromStatus, action: "rollbackToHeld" },
        "Deposit rollback to held lost a concurrent-update race; row was not at the expected status"
      );
    }
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
