/**
 * Guest linking for bookings: answer with a `guestId` to store, or a rejection,
 * without ever writing to an existing profile.
 *
 * - `resolveGuestLink` — read-only: a supplied id is accepted only when the guest
 *   belongs to the venue; otherwise exact email / phone matches within the venue,
 *   email winning over phone (as `guestService.findOrCreate` does).
 * - `linkOrCreateGuest` — staff path only: resolve, then create a bare Guest when
 *   nothing matched and both a name and a contact were given. Existing profiles
 *   are never updated (that is what sets this apart from `findOrCreate`).
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

export interface LinkOrCreateGuestInput extends GuestLinkInput {
  guestName?: string | null;
}

/** Prisma unique-constraint violation — the shape `isPrismaNotFound` checks, for P2002. */
function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}

export async function linkOrCreateGuest(input: LinkOrCreateGuestInput): Promise<GuestLinkResult> {
  const resolved = await resolveGuestLink(input);
  if (!resolved.ok || resolved.guestId !== null) return resolved;

  const { venueId, guestName, guestEmail, guestPhone } = input;
  if (!guestName || (!guestEmail && !guestPhone)) return resolved;

  try {
    const created = await guestService.create({
      venueId,
      name: guestName,
      ...(guestEmail ? { email: guestEmail } : {}),
      ...(guestPhone ? { phone: guestPhone } : {}),
    });
    return { ok: true, guestId: created.id };
  } catch (err) {
    // Two first-time bookings for the same contact raced and the other one won:
    // link to it instead of failing the booking.
    if (isPrismaUniqueViolation(err)) return resolveGuestLink(input);
    throw err;
  }
}
