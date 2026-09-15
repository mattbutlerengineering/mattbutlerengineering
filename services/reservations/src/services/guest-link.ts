/**
 * Guest linking for bookings: answer with a `guestId` to store, or a rejection,
 * without ever writing to an existing profile.
 *
 * - `resolveGuestLink` — read-only: a supplied id is accepted only when the guest
 *   belongs to the venue; otherwise exact email / phone matches within the venue,
 *   email winning over phone (as `guestService.findOrCreate` does).
 *
 * Cross-venue linking is impossible by construction: contact lookups go through
 * the venue-scoped compound uniques, and an id is checked against `guest.venueId`.
 */
import { guestService } from "./guest.js";

export interface GuestLinkInput {
  venueId: string;
  guestId?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
}

export type GuestLinkResult =
  { ok: true; guestId: string | null } | { ok: false; code: "GUEST_NOT_IN_VENUE" };

/** Nonexistent and foreign-venue ids get the identical answer — no existence leak. */
const GUEST_NOT_IN_VENUE: GuestLinkResult = Object.freeze({
  ok: false,
  code: "GUEST_NOT_IN_VENUE",
});

export async function resolveGuestLink(input: GuestLinkInput): Promise<GuestLinkResult> {
  const { venueId, guestId, guestEmail, guestPhone } = input;

  if (guestId) {
    const guest = await guestService.getById(guestId);
    return guest && guest.venueId === venueId
      ? { ok: true, guestId: guest.id }
      : GUEST_NOT_IN_VENUE;
  }

  // Both lookups run whenever their input is present — decided by input, never
  // by a hit — so timing is the same for a matched and an unknown contact.
  const [byEmail, byPhone] = await Promise.all([
    guestEmail ? guestService.findByEmail(venueId, guestEmail) : null,
    guestPhone ? guestService.findByPhone(venueId, guestPhone) : null,
  ]);

  return { ok: true, guestId: byEmail?.id ?? byPhone?.id ?? null };
}
