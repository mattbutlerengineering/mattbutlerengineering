import { prisma } from "./database.js";

/** ADR-002 problem detail for a request whose table is not in its venue. */
export const TABLE_NOT_IN_VENUE_DETAIL = "The requested table does not belong to this venue";

/**
 * Whether `tableId` names a table of `venueId`.
 *
 * Every write that takes a client-supplied `tableId` alongside a venue calls
 * this BEFORE it reads any conflict data: a member of venue A could otherwise
 * book, hold, or move onto a table of venue B, and the conflict answer (409 vs
 * success) would reveal whether venue B's slot is taken. A missing table and a
 * foreign one both answer `false`, so the rejection never reveals whether
 * another venue's table exists. Under `FORCE ROW LEVEL SECURITY` (ADR-026) a
 * foreign table reads as missing, so the answer is the same either way.
 */
export async function isTableInVenue(tableId: string, venueId: string): Promise<boolean> {
  const table = await prisma.table.findUnique({
    where: { id: tableId },
    select: { venueId: true },
  });
  return table?.venueId === venueId;
}
