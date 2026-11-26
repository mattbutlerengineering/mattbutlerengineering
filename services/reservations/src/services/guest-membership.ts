import { prisma } from "./database.js";
import { runWithVenueContext } from "./venue-context-store.js";

/**
 * Regulars Club membership (#9623). A row per (venue, guest), never a `Guest.tags`
 * entry, because staff edit tags freely. Every call is venue-scoped.
 */

/** Invites a guest as an ACTIVE regular. Idempotent; re-inviting a revoked member reactivates them. */
export function inviteMember(input: { venueId: string; guestId: string }) {
  const { venueId, guestId } = input;
  return runWithVenueContext(venueId, () =>
    prisma.guestMembership.upsert({
      where: { venueId_guestId: { venueId, guestId } },
      create: { venueId, guestId },
      update: { status: "ACTIVE", revokedAt: null },
    })
  );
}

/** The venue's members, optionally filtered by status. */
export function listMembers(input: { venueId: string; status?: "ACTIVE" | "REVOKED" }) {
  const { venueId, status } = input;
  return runWithVenueContext(venueId, () =>
    prisma.guestMembership.findMany({
      where: { venueId, ...(status ? { status } : {}) },
      orderBy: { invitedAt: "desc" },
      include: { guest: { select: { name: true, email: true } } },
    })
  );
}

/** Revokes an ACTIVE member. Returns false when there was nothing active to revoke. */
export async function revokeMember(input: { venueId: string; guestId: string }): Promise<boolean> {
  const { venueId, guestId } = input;
  const { count } = await runWithVenueContext(venueId, () =>
    prisma.guestMembership.updateMany({
      where: { venueId, guestId, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: new Date() },
    })
  );
  return count > 0;
}
