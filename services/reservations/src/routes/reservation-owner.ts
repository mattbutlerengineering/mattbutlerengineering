import type { FastifyRequest } from "fastify";
import type { OwnerResolver } from "@mbe/auth/fastify";

/**
 * Factory that returns an OwnerResolver for the guestEmail identity space.
 * Receives an injected getById to keep the resolver testable without hitting
 * the real Prisma client.
 *
 * Returns the reservation's guestEmail, or null when the reservation is not
 * found or has no guestEmail. A null return triggers a 403 (not 404) from
 * requireOwnershipOrAdmin — this is intentional: non-owners must not learn
 * whether a resource exists.
 */
export function resolveReservationGuestEmail(
  getById: (id: string) => Promise<{ guestEmail: string | null } | null>
): OwnerResolver {
  return async function (request: FastifyRequest): Promise<string | null> {
    const params = request.params as { id?: string };
    const id = params.id;
    if (!id) return null;
    const reservation = await getById(id);
    return reservation?.guestEmail ?? null;
  };
}

/**
 * OwnerResolver that extracts the current user's email from the JWT.
 * Used as resolveCurrentId so the identity space matches guestEmail.
 */
export async function resolveCurrentUserEmail(request: FastifyRequest): Promise<string | null> {
  return request.user?.email ?? null;
}
