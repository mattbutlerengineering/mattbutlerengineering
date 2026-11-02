import { Prisma, type PrismaClient } from "../generated/prisma/index.js";
import { prisma } from "./database.js";
import { runWithVenueContext } from "./venue-context-store.js";

/**
 * A series edit that grows the series saves it under a new rule id and removes the old one beside
 * it (`growthClosure` in the app). The old rule's outcomes (the guests it cancelled, their notices,
 * the call list, the refunds still to retry) are keyed by its id, so without this they would
 * be left on a row the Manager no longer sees. They follow the series to its new id instead.
 *
 * Carried outcomes are not new: the save's own post-commit work (notices, refunds, SSE) and its
 * replay answer leave them out (`carriedOutcomeIds`). The ids moved are recorded in the change's
 * `closure` meta, so Undo of that change (offered only when it told no guest) puts each one back.
 */

type Db = Pick<PrismaClient, "closureOutcome" | "$executeRaw">;

/** Rows per statement: well under the driver's bind-parameter limit. */
const CHUNK = 5_000;

/** What a growth edit moved, as stored on its audit row. */
export interface CarriedOutcomes {
  from: string;
  outcomeIds: string[];
}

/**
 * Re-keys outcomes to `ruleId` without touching `updated_at`: the refund sweeper judges a pending
 * refund by how long ago its row last changed, and a move is not a change to the refund.
 */
async function rekey(tx: Pick<Db, "$executeRaw">, ids: readonly string[], ruleId: string) {
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    await tx.$executeRaw`UPDATE closure_outcomes SET date_rule_id = ${ruleId} WHERE id IN (${Prisma.join(chunk)})`;
  }
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
  await rekey(tx, outcomeIds, to);
  return { from, outcomeIds };
}

const carriedOf = (inverse: unknown): CarriedOutcomes | undefined =>
  (inverse as { closure?: { carried?: CarriedOutcomes } } | null)?.closure?.carried;

/** Undo of a growth: the outcomes it moved go back to the rule they came from. */
export async function returnCarriedOutcomes(tx: Db, inverse: unknown): Promise<void> {
  const carried = carriedOf(inverse);
  if (carried) await rekey(tx, carried.outcomeIds, carried.from);
}

/** `carriedOutcomeIds` in the venue's own context, for a caller outside a transaction. */
export const readCarriedOutcomeIds = (venueId: string, ruleId: string): Promise<string[]> =>
  runWithVenueContext(venueId, () => carriedOutcomeIds(prisma, venueId, ruleId));

/**
 * The outcomes a saved closure carried over from the series it replaced; `[]` for any other rule.
 * Read from the audit row that saved it, so a replay and a retried post-commit step agree.
 */
export async function carriedOutcomeIds(
  db: Pick<PrismaClient, "availabilityChange">,
  venueId: string,
  ruleId: string
): Promise<string[]> {
  const change = await db.availabilityChange.findFirst({
    where: { venueId, kind: "closure", inverse: { path: ["closure", "ruleId"], equals: ruleId } },
    select: { inverse: true },
  });
  return carriedOf(change?.inverse)?.outcomeIds ?? [];
}
