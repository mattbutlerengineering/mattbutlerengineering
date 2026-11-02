import type { PrismaClient } from "../generated/prisma/index.js";

/**
 * A series edit that grows the series saves it under a new rule id and removes the old one beside
 * it (`growthClosure` in the app). The old rule's outcomes (the guests it cancelled, their notices,
 * the call list, the refunds still to retry) are keyed by its id, so without this they would
 * be left on a row the Manager no longer sees. They follow the series to its new id instead.
 *
 * The ids moved are recorded in the change's `closure` meta, so Undo of that change (offered only
 * when it told no guest) can put each one back exactly where it was.
 */

type Db = Pick<PrismaClient, "closureOutcome">;

/** What a growth edit moved, as stored on its audit row. */
export interface CarriedOutcomes {
  from: string;
  outcomeIds: string[];
}

/**
 * Moves the outcomes of `from` onto `to`, except those of a booking the edit is about to give its
 * own outcome (`deciding`): there is one outcome per booking and rule. `to` is a new rule, so it
 * has none yet. Returns what moved, or `null` when nothing did.
 */
export async function carryOutcomes(
  tx: Db,
  venueId: string,
  from: string,
  to: string,
  deciding: readonly string[]
): Promise<CarriedOutcomes | null> {
  const moving = await tx.closureOutcome.findMany({
    where: { venueId, dateRuleId: from, reservationId: { notIn: [...deciding] } },
    select: { id: true },
  });
  if (moving.length === 0) return null;
  const outcomeIds = moving.map((o) => o.id);
  await tx.closureOutcome.updateMany({
    where: { venueId, id: { in: outcomeIds } },
    data: { dateRuleId: to },
  });
  return { from, outcomeIds };
}

/** Undo of a growth: the outcomes it moved go back to the rule they came from. */
export async function returnCarriedOutcomes(
  tx: Db,
  venueId: string,
  inverse: unknown
): Promise<void> {
  const carried = (inverse as { closure?: { carried?: CarriedOutcomes } } | null)?.closure?.carried;
  if (!carried || carried.outcomeIds.length === 0) return;
  await tx.closureOutcome.updateMany({
    where: { venueId, id: { in: carried.outcomeIds } },
    data: { dateRuleId: carried.from },
  });
}
