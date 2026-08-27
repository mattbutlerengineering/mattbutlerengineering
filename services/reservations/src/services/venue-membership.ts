import type { HasAnyVenueMembership, VenueMembershipLookup } from "@mbe/auth/fastify";
import type { PrismaClient } from "../generated/prisma/index.js";
import { prisma } from "./database.js";

/**
 * Builds the venue-membership lookup injected into `requireVenueAccess`
 * (ADR-020). Resolves whether the given Auth0 `sub` holds any membership row
 * for the venue. Queried per request so a removed membership denies access on
 * the very next call — no JWT refresh required. The Prisma query is fully
 * parameterized.
 */
export function createVenueMembershipLookup(client: PrismaClient = prisma): VenueMembershipLookup {
  return async (userSub: string, venueId: string): Promise<boolean> => {
    const count = await client.venueMembership.count({ where: { userSub, venueId } });
    return count > 0;
  };
}

/**
 * Builds the "does this user hold ANY venue membership" lookup injected into
 * `requireVenueCreateAccess` (ADR-020, third case). Scoped to `userSub` alone —
 * deliberately not to a venue — so it answers "is this account brand new",
 * which is the only question the bootstrap rule asks.
 *
 * Uses the existing `@@index([userSub])` on `venue_memberships`, so this is one
 * indexed count per venue-creation attempt and never on a hot path.
 *
 * A query rejection propagates. It is never coerced to `false`: `false` means
 * "admit the bootstrap", so swallowing a database outage here would let any
 * authenticated identity create venues.
 */
export function createHasAnyVenueMembership(client: PrismaClient = prisma): HasAnyVenueMembership {
  return async (userSub: string): Promise<boolean> => {
    const count = await client.venueMembership.count({ where: { userSub } });
    return count > 0;
  };
}
