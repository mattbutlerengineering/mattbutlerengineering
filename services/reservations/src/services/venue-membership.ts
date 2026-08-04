import type { VenueMembershipLookup } from "@mbe/auth/fastify";
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
