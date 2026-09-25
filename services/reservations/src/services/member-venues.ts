import type { PrismaClient } from "../generated/prisma/index.js";
import { prisma } from "./database.js";

/**
 * Resolves the distinct venue ids a staff member's memberships span, read
 * directly off `venue_memberships` — the one venue-scoped table ADR-026 §1
 * explicitly excludes from the RLS backstop (no `ENABLE ROW LEVEL SECURITY`
 * on it anywhere in the migration history), so this is not an unscoped read
 * of an RLS-protected table and needs no escape hatch.
 *
 * {@link venueService.listForMember} fans out over this list one venue at a
 * time via `runWithVenueContext`, instead of a single cross-venue
 * `venue.findMany` filtered by `memberships: { some: { userSub } } }` — the
 * shape that returns zero rows under `FORCE ROW LEVEL SECURITY` for any
 * member of more than one venue (ADR-026 §3.2 item 1).
 */
export async function getMemberVenueIds(
  userSub: string,
  client: PrismaClient = prisma
): Promise<string[]> {
  const memberships = await client.venueMembership.findMany({
    where: { userSub },
    select: { venueId: true },
    distinct: ["venueId"],
  });
  return memberships.map((membership) => membership.venueId);
}
