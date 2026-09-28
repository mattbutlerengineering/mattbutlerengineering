import { resolveVenueId } from "./resolve-venue.js";

/**
 * Venue resolution for deposit actions (ADR-026, issue #5382 / #5369 PR 7).
 *
 * `deposits` is the one venue-scoped table in this schema with no `venue_id`
 * column of its own (ADR-026 §1) — it is scoped transitively through its
 * unique `reservation_id`, which is exactly what the `deposit_isolation`
 * policy's `EXISTS (... FROM reservations ...)` subquery checks (§5). The
 * admin deposit routes are addressed only by an opaque deposit/reservation
 * id, so they cannot read a venue id off the request the way every
 * `venueIdFromQuery`/`venueIdFromBody` route does; they resolve it here
 * instead, and hand it to `runWithVenueContext` so `app.venue_id` is set for
 * the work that follows.
 */

/**
 * Resolves the venue owning `reservationId`.
 *
 * Returns `null` when the reservation does not exist or carries no venue
 * (`Reservation.venueId` is nullable). Callers MUST fail closed on `null`
 * rather than proceeding with no venue context: a venue-less session is
 * ADR-026 §4 default-deny, which under `FORCE ROW LEVEL SECURITY` makes the
 * deposit silently invisible instead of raising — the exact silent-blinding
 * failure #5382 exists to prevent. `null` is also already a 403 by ADR-020's
 * `requireVenueAccess` decision matrix, so refusing here is consistent with
 * the application layer, not a new restriction.
 *
 * Resolves through the `SECURITY DEFINER` `app_resolve_venue_id` function
 * (`resolveVenueId`, ADR-026 §3.3 item 6 / #5369 PR 7) rather than a plain
 * `prisma.reservation.findUnique` — that was itself an unscoped read of an
 * RLS-scoped table and resolved `null` under `FORCE ROW LEVEL SECURITY`
 * (measured 2026-09-21, ADR-026 §3.2's blockquote), which is exactly the
 * "lookup can't run inside the scope it's computing" trap `resolveVenueId`
 * exists to close for every other entity-addressed route in this service.
 */
export async function resolveReservationVenueId(reservationId: string): Promise<string | null> {
  return resolveVenueId("reservation", reservationId);
}
