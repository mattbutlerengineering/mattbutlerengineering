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
