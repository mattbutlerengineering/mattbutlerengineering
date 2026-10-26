import type { ClosureRefundPayload, JobScheduler } from "../jobs/index.js";
import { JOB_TYPES } from "../jobs/index.js";
import type { PaymentsPort } from "../transitions/ports.js";
import type { ClosureRefundStatus, Deposit } from "../generated/prisma/index.js";
import type { DepositService } from "./deposit.js";
import type { ReservationEventActor } from "./reservation-events.js";
import { TransitionError } from "./state-machine.js";

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
 *    refund at Stripe past the idempotency key's ~24h TTL.
 *
 * The job key `closure:<ruleId>:<reservationId>` dedupes the JOB only. Stripe
 * idempotency keys stay `DepositService`'s own (`${depositId}:refund`) and
 * `${depositId}:closureRefund` for the captured leg.
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
  /** Outcomes of one closure whose refund is in one of `statuses`. */
  listByRule(
    venueId: string,
    ruleId: string,
    statuses: readonly ClosureRefundStatus[]
  ): Promise<{ id: string; reservationId: string }[]>;
}

export interface ClosureRefundDeps {
  deposits: Pick<DepositService, "getByReservationId" | "hold" | "refund">;
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

/** Refund what a captured deposit still owes the guest, through Stripe's refund API. */
async function refundCaptured(
  deps: ClosureRefundDeps,
  deposit: Deposit,
  row: ClosureRefundRow
): Promise<Settled> {
  if (row.reservation?.cancellationReason !== "venue_closure") return "none";
  const pi = deposit.stripePaymentIntentId;
  if (!pi) {
    throw new ClosureRefundPermanentError(
      `Deposit ${deposit.id} has no Stripe payment; refund it by hand`
    );
  }
  const intent = await deps.payments.retrievePaymentIntent(pi);
  if (intent.status === "canceled") return "none";
  if (intent.status === "requires_capture") {
    // The recorded capture never landed: release the hold, there is nothing to refund.
    await deps.payments.cancelPaymentIntent(pi, `${deposit.id}:refund`);
    return "done";
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
    `${deposit.id}:closureRefund`,
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

async function settleDeposit(deps: ClosureRefundDeps, row: ClosureRefundRow): Promise<Settled> {
  for (let read = 0; read < MAX_REREADS; read += 1) {
    const deposit = await deps.deposits.getByReservationId(row.reservationId);
    if (!deposit) return "none";
    if (deposit.status === "refunded") return "done";
    if (deposit.status === "uncollectable") return "none";
    if (deposit.status === "held") {
      await deps.deposits.refund(deposit.id);
      return "done";
    }
    if (CAPTURED.has(deposit.status)) return refundCaptured(deps, deposit, row);
    if (deposit.status === "pending") {
      const resolved = await resolvePending(deps, deposit);
      if (resolved) return resolved;
    }
  }
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
  try {
    await deps.store.setRefund(row.id, await settleDeposit(deps, row));
  } catch (error) {
    // The row moved on between our read and the write; retrying the same
    // transition cannot succeed, and the next job run re-reads it anyway.
    if (error instanceof TransitionError) {
      throw new ClosureRefundPermanentError(error.message);
    }
    throw error;
  }
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
      await deps.store.setRefund(payload.outcomeId, "failed").catch(() => undefined);
    }
    throw error;
  }
}

/**
 * Enqueues one job per outcome of the closure whose refund is in `statuses`,
 * after the closure's transaction committed. A retry first returns the
 * outcomes to `pending` and uses a fresh job id: BullMQ keeps a failed job
 * under its old id and would silently ignore a re-add.
 */
export async function enqueueClosureRefunds(
  deps: { store: ClosureRefundStore; jobs: Pick<JobScheduler, "schedule"> },
  venueId: string,
  ruleId: string,
  statuses: readonly ClosureRefundStatus[],
  opts: { retry?: boolean; now?: () => number } = {}
): Promise<number> {
  const outcomes = await deps.store.listByRule(venueId, ruleId, statuses);
  for (const outcome of outcomes) {
    if (opts.retry) await deps.store.setRefund(outcome.id, "pending");
    const base = closureRefundJobId(ruleId, outcome.reservationId);
    const jobId = opts.retry ? `${base}_retry_${(opts.now ?? Date.now)()}` : base;
    await deps.jobs.schedule(
      JOB_TYPES.CLOSURE_REFUND,
      { outcomeId: outcome.id, venueId },
      0,
      jobId
    );
  }
  return outcomes.length;
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
}): ClosureRefunds {
  return {
    enqueue: (venueId, ruleId) => enqueueClosureRefunds(deps, venueId, ruleId, ["pending"]),
    retry: (venueId, ruleId) =>
      enqueueClosureRefunds(deps, venueId, ruleId, ["failed", "pending"], { retry: true }),
  };
}
