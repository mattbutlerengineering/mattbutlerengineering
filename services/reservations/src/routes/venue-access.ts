import type { FastifyRequest } from "fastify";
import type { VenueIdResolver } from "@mbe/auth/fastify";

/**
 * Venue-id resolvers for `requireVenueAccess` (ADR-020). The staff routes name
 * the tenant key `venueId` consistently across query, body, and params; these
 * helpers extract it defensively (schema validation has already run, but the
 * resolver never assumes a shape it hasn't checked).
 */

/** Reads `venueId` from the query string (staff list/search routes). */
export const venueIdFromQuery: VenueIdResolver = (request) => {
  const query = request.query as { venueId?: unknown } | null | undefined;
  return typeof query?.venueId === "string" ? query.venueId : null;
};

/** Reads `venueId` from the request body (staff create routes). */
export const venueIdFromBody: VenueIdResolver = (request) => {
  const body = request.body as { venueId?: unknown } | null | undefined;
  return typeof body?.venueId === "string" ? body.venueId : null;
};

/** Reads `venueId` from a route param (routes addressed by `:venueId`). */
export const venueIdFromParams: VenueIdResolver = (request) => {
  const params = request.params as { venueId?: unknown } | null | undefined;
  return typeof params?.venueId === "string" ? params.venueId : null;
};

/**
 * Builds a `VenueIdResolver` for routes addressed by an entity other than the
 * venue itself (e.g. a table, floor plan, or guest id), scoping the action to
 * that entity's owning venue.
 *
 * `getKey` extracts the lookup key from the request (a param or body field);
 * `load` fetches the owning entity by that key. Resolves to `null` when the
 * key is missing/malformed, the entity does not exist, or the entity has no
 * venue — `requireVenueAccess` turns `null` into a 403, never leaking
 * existence to non-members.
 */
export function venueIdFromEntity<T extends { venueId: string | null }>(
  getKey: (request: FastifyRequest) => unknown,
  load: (key: string) => Promise<T | null | undefined>
): VenueIdResolver {
  return async (request) => {
    const key = getKey(request);
    if (typeof key !== "string") return null;
    const entity = await load(key);
    return entity?.venueId ?? null;
  };
}
