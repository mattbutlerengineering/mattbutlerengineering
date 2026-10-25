import type { ClosureAction, ClosureResult } from "@mbe/types";
import type { PrismaClient } from "../generated/prisma/index.js";
import { setVenueContext } from "../middleware/venue-context.js";
import { countActions } from "./closure-command-plan.js";

/**
 * The second half of the closure command: the reservation transitions the
 * saved outcomes call for. They run after the rule and the outcome rows have
 * committed, because a cancel moves money through Stripe
 * (`cancelReservationWithDeposit`) and writes in its own transactions, so it
 * cannot join the rule's. The outcome rows are the work list: a transition
 * already applied is skipped, so running this again (a replay of the same
 * `Idempotency-Key`) finishes what failed and never cancels twice.
 */

type ApplyClient = Pick<PrismaClient, "$transaction">;
export type TransitionResult = { ok: true } | { ok: false; reason: string };

export interface ClosureTransitions {
  /** Staff-initiated cancel: full refund of a held deposit, event recorded. */
  cancel(reservationId: string): Promise<TransitionResult>;
  move(reservationId: string, to: { startTime: Date; endTime: Date }): Promise<TransitionResult>;
}

interface OutcomeWork {
  id: string;
  action: ClosureAction;
  reservationId: string;
  movedTo: Date | null;
  refund: string;
  reservation: { status: string; startTime: Date; endTime: Date };
}

function isApplied(o: OutcomeWork): boolean {
  if (o.action === "cancel") return o.reservation.status === "CANCELLED";
  if (o.action === "move")
    return o.movedTo !== null && o.reservation.startTime.getTime() === o.movedTo.getTime();
  return true;
}

function loadOutcomes(
  client: ApplyClient,
  venueId: string,
  ruleId: string
): Promise<OutcomeWork[]> {
  return client.$transaction(async (tx) => {
    await setVenueContext(tx, venueId);
    return tx.closureOutcome.findMany({
      where: { venueId, dateRuleId: ruleId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        action: true,
        reservationId: true,
        movedTo: true,
        refund: true,
        reservation: { select: { status: true, startTime: true, endTime: true } },
      },
    });
  });
}

async function applyOne(
  o: OutcomeWork,
  transitions: ClosureTransitions
): Promise<TransitionResult> {
  if (o.action === "cancel") return transitions.cancel(o.reservationId);
  const to = o.movedTo as Date; // invariant: a `move` outcome is written with its target
  const length = o.reservation.endTime.getTime() - o.reservation.startTime.getTime();
  return transitions.move(o.reservationId, {
    startTime: to,
    endTime: new Date(to.getTime() + length),
  });
}

/** A cancelled booking's held deposit was refunded in full by the cancel itself. */
function markRefunded(client: ApplyClient, venueId: string, outcomeId: string): Promise<unknown> {
  return client.$transaction(async (tx) => {
    await setVenueContext(tx, venueId);
    return tx.closureOutcome.updateMany({
      where: { id: outcomeId, venueId, refund: "pending" },
      data: { refund: "done" },
    });
  });
}

export async function applyClosureOutcomes(
  client: ApplyClient,
  venueId: string,
  ruleId: string,
  transitions: ClosureTransitions
): Promise<Pick<ClosureResult, "outcomes" | "unapplied">> {
  const outcomes = await loadOutcomes(client, venueId, ruleId);
  const unapplied: ClosureResult["unapplied"] = [];
  for (const o of outcomes) {
    if (o.action === "keep_notify" || o.action === "keep_silent" || isApplied(o)) continue;
    const result = await applyOne(o, transitions);
    if (!result.ok) {
      unapplied.push({ reservationId: o.reservationId, action: o.action, reason: result.reason });
    } else if (o.action === "cancel") {
      await markRefunded(client, venueId, o.id);
    }
  }
  return { outcomes: countActions(outcomes.map((o) => o.action)), unapplied };
}
