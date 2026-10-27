import type { ClosureRefundPayload, JobScheduler } from "../jobs/index.js";
import { JOB_TYPES } from "../jobs/index.js";
import type { PaymentsPort } from "../transitions/ports.js";
import type { ClosureRefundStatus, Deposit } from "../generated/prisma/index.js";
import {
  DepositAlreadyCapturedError,
  DepositConcurrentUpdateError,
  type DepositService,
} from "./deposit.js";
import type { ReservationEventActor } from "./reservation-events.js";
import { TransitionError } from "./state-machine.js";
import { StripeOperationError } from "./stripe.js";

/**
 * The CLOSURE_REFUND job (docs/features/venue-availability/architecture.md
 * § Jobs). The closure command cancels bookings in its transaction and leaves
 * each deposit for this job, with the outcome `refund: pending`. That flag is a
 * hint, never the truth: the deposit's LIVE status decides what happens.
 *
 *  - `held` → `DepositService.refund()` (cancels the authorization).
 *  - `pending` (authorized, webhook not landed) → hold, then refund; an intent
 *    the guest never authorized is cancelled so it can never be paid later.
 *    The state machine has no `pending` → `refunded` edge, so the row itself
 *    stays `pending`; the intent is what is voided.
 *  - `refunded` / `uncollectable` → settled, no Stripe call.
 *  - `forfeited` / `applied` / `partial_refunded` (the late-cancel race) on a
 *    `venue_closure` reservation → what was captured goes back through
 *    Stripe's refund API, tagged `closureRefund` so a retry finds its own
 *    refund at Stripe past the idempotency key's ~24h TTL. If the capture never
 *    landed, the intent is cancelled and the row written off as `uncollectable`.
 *
 * The deposit can move between this job's read and the service's own re-read
 * (a late-cancel forfeit, the authorization webhook). A `TransitionError` or
 * lost compare-and-swap from that race re-reads and decides again; if the row
 * keeps moving, a plain error lets BullMQ retry.
 *
 * The job key `closure:<ruleId>:<reservationId>` dedupes the JOB only. Stripe
 * idempotency keys stay `DepositService`'s own (`${depositId}:refund`) and
 * `${depositId}:closureRefund:${owed}` for the captured leg. The amount is part of
 * the key so Stripe's cached rejection of an over-amount attempt cannot block the
 * corrected smaller one for ~24h; `findDepositRefund` runs before every create, so
 * a different key never means a second refund.
 *
 * Runs inside `runWithVenueContext(venueId, …)` (set by the job handler).
 */

export type { ClosureRefundStatus };

export interface ClosureRefundRow {
  id: string;
  venueId: string;
  reservationId: string;
  dateRuleId: string;
  refund: ClosureRefundStatus;
  reservation: { status: string; cancellationReason: string | null } | null;
}

export interface ClosureRefundStore {
  load(outcomeId: string): Promise<ClosureRefundRow | null>;
  setRefund(outcomeId: string, refund: ClosureRefundStatus): Promise<void>;
  /**
   * Returns a `failed` outcome to `pending` BEFORE its retry job is scheduled. Conditional on
   * `failed`: a row that settled (`done` / `none`) or is already `pending` is left alone.
   * Resetting first means a job that fails permanently always runs `markFailed` after the
   * reset, so the failure is never overwritten.
   */
  resetToPending(outcomeId: string): Promise<void>;
  /** Records `failed`, leaving an outcome a concurrent run already settled (`done` / `none`). */
  markFailed(outcomeId: string): Promise<void>;
  /** Outcomes of one closure whose refund is in one of `statuses`. */
  listByRule(
    venueId: string,
    ruleId: string,
    statuses: readonly ClosureRefundStatus[]
  ): Promise<{ id: string; reservationId: string; refund: ClosureRefundStatus }[]>;
}

export interface ClosureRefundDeps {
  deposits: Pick<DepositService, "getByReservationId" | "hold" | "refund" | "writeOffUncaptured">;
  payments: PaymentsPort;
  store: ClosureRefundStore;
}

/** A failure retrying cannot fix; the job fails at once instead of burning attempts. */
export class ClosureRefundPermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClosureRefundPermanentError";
  }
}

/** The logical job key; it dedupes the job and never reaches Stripe. */
export const closureRefundKey = (ruleId: string, reservationId: string): string =>
  `closure:${ruleId}:${reservationId}`;

/** BullMQ rejects `:` in a custom job id, so the key's separators become `_`. */
export const closureRefundJobId = (ruleId: string, reservationId: string): string =>
  closureRefundKey(ruleId, reservationId).replaceAll(":", "_");

const CAPTURED: ReadonlySet<string> = new Set(["forfeited", "applied", "partial_refunded"]);
const MAX_REREADS = 3;
const REFUND_ACTOR: ReservationEventActor = { type: "system", id: "closure-refund" };

type Settled = ClosureRefundStatus;
type CapturedStatus = "forfeited" | "applied" | "partial_refunded";

/**
 * The intent is (now) cancelled, so nothing was charged: write the row off.
 * `null` = the row moved before the write; read it again.
 */
async function writeOff(
  deps: ClosureRefundDeps,
  deposit: Deposit,
  settled: Settled
): Promise<Settled | null> {
  const count = await deps.deposits.writeOffUncaptured(
    deposit.id,
    deposit.status as CapturedStatus
  );
  return count > 0 ? settled : null;
}

/**
 * Refund what a captured deposit still owes the guest, through Stripe's refund
 * API. `null` = the row moved; read it again.
 */
async function refundCaptured(
  deps: ClosureRefundDeps,
  deposit: Deposit,
  row: ClosureRefundRow
): Promise<Settled | null> {
  if (row.reservation?.cancellationReason !== "venue_closure") return "none";
  const pi = deposit.stripePaymentIntentId;
  if (!pi) {
    throw new ClosureRefundPermanentError(
      `Deposit ${deposit.id} has no Stripe payment; refund it by hand`
    );
  }
  const intent = await deps.payments.retrievePaymentIntent(pi);
  if (intent.status === "canceled") return writeOff(deps, deposit, "none");
  if (intent.status === "requires_capture") {
    // The recorded capture never landed: release the hold, there is nothing to refund.
    await deps.payments.cancelPaymentIntent(pi, `${deposit.id}:refund`);
    return writeOff(deps, deposit, "done");
  }
  if (intent.status !== "succeeded") {
    throw new Error(`Payment ${pi} is ${intent.status}; cannot tell whether it was captured`);
  }
  if (await deps.payments.findDepositRefund(pi, deposit.id, "closureRefund")) return "done";

  const ownLeg =
    deposit.status === "partial_refunded"
      ? ((await deps.payments.findDepositRefund(pi, deposit.id, "refundPartial"))?.amount ?? 0)
      : 0;
  const owed = deposit.amountCents - ownLeg - (deposit.postCaptureRefundCents ?? 0);
  if (owed <= 0) return "done";
  await deps.payments.createPartialRefund(
    pi,
    owed,
    deposit.id,
    `${deposit.id}:closureRefund:${owed}`,
    "closureRefund"
  );
  return "done";
}

/** Resolves a `pending` deposit. `null` = it became `held`; read the row again. */
async function resolvePending(deps: ClosureRefundDeps, deposit: Deposit): Promise<Settled | null> {
  const pi = deposit.stripePaymentIntentId;
  if (!pi) return "none"; // never reached Stripe; nothing was authorized
  const intent = await deps.payments.retrievePaymentIntent(pi);
  switch (intent.status) {
    case "canceled":
      return "none";
    case "requires_capture":
      await deps.deposits.hold(deposit.id, pi, REFUND_ACTOR);
      return null;
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":
      // Not authorized: cancel the intent so it can never be paid for a cancelled booking.
      await deps.payments.cancelPaymentIntent(pi, `${deposit.id}:refund`);
      return "none";
    case "succeeded":
      throw new ClosureRefundPermanentError(
        `Deposit ${deposit.id} was captured while still pending; reconcile it by hand`
      );
    default:
      throw new Error(`Payment ${pi} is ${intent.status}; try again`);
  }
}

/**
 * A `refunded` row is written BEFORE Stripe's cancel, so a crash (or a failed
 * rollback) can leave the authorization live. Verify the intent and cancel it
 * under the same key `refund()` uses; a no-op when it is already void.
 */
async function confirmRefundedIntentVoid(deps: ClosureRefundDeps, deposit: Deposit): Promise<void> {
  const pi = deposit.stripePaymentIntentId;
  if (!pi) return;
  const intent = await deps.payments.retrievePaymentIntent(pi);
  if (intent.status === "requires_capture") {
    await deps.payments.cancelPaymentIntent(pi, `${deposit.id}:refund`);
  } else if (intent.status === "succeeded" || intent.status === "processing") {
    // The rollback to `held` failed after a capture; the row lies. Never record `done`.
    throw new ClosureRefundPermanentError(
      `Deposit ${deposit.id} is refunded but its payment ${pi} is ${intent.status}; refund it by hand`
    );
  }
}

/** `refund()` on a held deposit; money captured outside the app is for a human. */
async function refundHeld(deps: ClosureRefundDeps, deposit: Deposit): Promise<void> {
  try {
    await deps.deposits.refund(deposit.id);
  } catch (error) {
    // Also thrown when the intent is `processing`, not only `succeeded`.
    if (error instanceof DepositAlreadyCapturedError) {
      throw new ClosureRefundPermanentError(
        `Deposit ${deposit.id} was captured outside the app; refund it by hand`
      );
    }
    throw error;
  }
}

/** One decision on one read of the deposit. `null` = read it again. */
async function settleOnce(deps: ClosureRefundDeps, row: ClosureRefundRow): Promise<Settled | null> {
  const deposit = await deps.deposits.getByReservationId(row.reservationId);
  if (!deposit) return "none";
  if (deposit.status === "refunded") {
    await confirmRefundedIntentVoid(deps, deposit);
    return "done";
  }
  if (deposit.status === "uncollectable") return "none";
  if (deposit.status === "held") {
    await refundHeld(deps, deposit);
    return "done";
  }
  if (CAPTURED.has(deposit.status)) return refundCaptured(deps, deposit, row);
  if (deposit.status === "pending") return resolvePending(deps, deposit);
  return null;
}

/** Stripe rejections no retry can fix: the same request fails the same way every time. */
const PERMANENT_STRIPE_TYPES: ReadonlySet<string> = new Set([
  "StripeCardError",
  "StripeInvalidRequestError",
  "StripeAuthenticationError",
  "StripePermissionError",
]);

/** A non-retriable Stripe error becomes a permanent failure; anything else passes through. */
function asPermanentIfStripeRejection(error: unknown): unknown {
  if (error instanceof StripeOperationError && PERMANENT_STRIPE_TYPES.has(error.stripeType)) {
    return new ClosureRefundPermanentError(
      `Stripe rejected the refund (${error.stripeType}: ${error.message}); refund it by hand`
    );
  }
  return error;
}

/** The row moved between our read and the service's re-read or its CAS. */
const isRace = (error: unknown): boolean =>
  error instanceof TransitionError || error instanceof DepositConcurrentUpdateError;

async function settleDeposit(deps: ClosureRefundDeps, row: ClosureRefundRow): Promise<Settled> {
  for (let read = 0; read < MAX_REREADS; read += 1) {
    try {
      const settled = await settleOnce(deps, row);
      if (settled) return settled;
    } catch (error) {
      if (!isRace(error)) throw asPermanentIfStripeRejection(error);
    }
  }
  // Retriable on purpose: BullMQ's bounded attempts re-run the job, and the
  // final attempt records `failed`.
  throw new Error(`Deposit for ${row.reservationId} kept changing; try again`);
}

/**
 * Settles one outcome's deposit and records the result. Safe to run twice:
 * an outcome already `done` / `none` is left alone.
 */
export async function settleClosureRefund(
  deps: ClosureRefundDeps,
  payload: ClosureRefundPayload
): Promise<void> {
  const row = await deps.store.load(payload.outcomeId);
  if (!row) throw new ClosureRefundPermanentError(`Closure outcome ${payload.outcomeId} not found`);
  if (row.refund === "done" || row.refund === "none") return;
  await deps.store.setRefund(row.id, await settleDeposit(deps, row));
}

/**
 * The job body: settle, and record `failed` when the failure is permanent or
 * the last attempt. Earlier failures leave `pending` and rethrow, so BullMQ
 * retries (bounded by the queue's attempts).
 */
export async function runClosureRefundJob(
  deps: ClosureRefundDeps,
  payload: ClosureRefundPayload,
  opts: { isFinalAttempt: boolean }
): Promise<void> {
  try {
    await settleClosureRefund(deps, payload);
  } catch (error) {
    if (error instanceof ClosureRefundPermanentError || opts.isFinalAttempt) {
      await deps.store.markFailed(payload.outcomeId).catch(() => undefined);
    }
    throw error;
  }
}

/** The slice of a Fastify/pino logger the enqueue path needs. */
export interface RefundLogger {
  error(context: Record<string, unknown>, message: string): void;
}

/** A job could not be scheduled partway through; `enqueued` outcomes already have theirs. */
export class ClosureRefundEnqueueError extends Error {
  constructor(
    readonly enqueued: number,
    cause: unknown
  ) {
    super(`Scheduled ${enqueued} closure refund job(s) before the queue failed`, { cause });
    this.name = "ClosureRefundEnqueueError";
  }
}

/**
 * Enqueues one job per outcome of the closure whose refund is in `statuses`,
 * after the closure's transaction committed. A retry uses a fresh job id (BullMQ
 * keeps a failed job under its old id and would silently ignore a re-add) and
 * resets a `failed` row to `pending` BEFORE scheduling, so the job's own `markFailed` always
 * lands after the reset. If scheduling fails, a row that was `failed` is put back to `failed`
 * (the same conditional update, so a settled row is untouched).
 * A failure partway throws `ClosureRefundEnqueueError` with the count already scheduled.
 */
export async function enqueueClosureRefunds(
  deps: {
    store: ClosureRefundStore;
    jobs: Pick<JobScheduler, "schedule">;
    log?: RefundLogger;
  },
  venueId: string,
  ruleId: string,
  statuses: readonly ClosureRefundStatus[],
  opts: { retry?: boolean; now?: () => number } = {}
): Promise<number> {
  const outcomes = await deps.store.listByRule(venueId, ruleId, statuses);
  let enqueued = 0;
  for (const outcome of outcomes) {
    const base = closureRefundJobId(ruleId, outcome.reservationId);
    const jobId = opts.retry ? `${base}_retry_${(opts.now ?? Date.now)()}` : base;
    try {
      if (opts.retry) await deps.store.resetToPending(outcome.id);
      await deps.jobs.schedule(
        JOB_TYPES.CLOSURE_REFUND,
        { outcomeId: outcome.id, venueId },
        0,
        jobId
      );
    } catch (error) {
      if (opts.retry && outcome.refund === "failed") {
        await deps.store.markFailed(outcome.id).catch((restoreError: unknown) => {
          // The row stays `pending` with no job; the next retry picks it up (it covers pending).
          deps.log?.error(
            { err: restoreError, venueId, ruleId, outcomeId: outcome.id },
            "closure refund retry: could not restore the failed outcome after a scheduling error"
          );
        });
      }
      throw new ClosureRefundEnqueueError(enqueued, error);
    }
    enqueued += 1;
  }
  return enqueued;
}

/**
 * What routes call. `enqueue` runs after the closure committed. `retry` is for
 * the Special dates tab (#7527): it re-enqueues failed outcomes, and pending
 * ones too, which covers a closure whose enqueue itself was lost.
 */
export interface ClosureRefunds {
  enqueue(venueId: string, ruleId: string): Promise<number>;
  retry(venueId: string, ruleId: string): Promise<number>;
}

export function createClosureRefunds(deps: {
  store: ClosureRefundStore;
  jobs: Pick<JobScheduler, "schedule">;
  log?: RefundLogger;
}): ClosureRefunds {
  return {
    enqueue: (venueId, ruleId) => enqueueClosureRefunds(deps, venueId, ruleId, ["pending"]),
    retry: (venueId, ruleId) =>
      enqueueClosureRefunds(deps, venueId, ruleId, ["failed", "pending"], { retry: true }),
  };
}
