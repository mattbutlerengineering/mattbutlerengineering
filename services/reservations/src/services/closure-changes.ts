import type { Reservation } from "@mbe/types";
import { prisma } from "./database.js";
import { toReservation } from "./serializers.js";
import { runWithVenueContext } from "./venue-context-store.js";

export interface ClosureChanges {
  cancelled: Reservation[];
  moved: Reservation[];
}

/**
 * The committed bookings a closure cancelled or moved, for the post-commit SSE events.
 * Read from the outcome rows in the venue's context. A cancel that did not stick, or a
 * moved booking cancelled since, is left out: it is not a change to announce.
 */
export async function loadClosureChanges(venueId: string, ruleId: string): Promise<ClosureChanges> {
  const outcomes = await runWithVenueContext(venueId, () =>
    prisma.closureOutcome.findMany({
      where: { venueId, dateRuleId: ruleId, action: { in: ["cancel", "move"] } },
      select: { action: true, reservation: { include: { table: true } } },
    })
  );
  const pick = (action: string, cancelled: boolean): Reservation[] =>
    outcomes
      .filter((o) => o.action === action && (o.reservation.status === "CANCELLED") === cancelled)
      .map((o) => toReservation(o.reservation));
  return { cancelled: pick("cancel", true), moved: pick("move", false) };
}
