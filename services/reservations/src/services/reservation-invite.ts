import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./database.js";
import { runWithVenueContext } from "./venue-context-store.js";

/**
 * Shareable party-invite tokens (The Invitation, #8661).
 *
 * The token is `<venueId>.<secret>`. `secret` is 128+ random bits and only its
 * SHA-256 hash is stored, so the row cannot be turned back into a link. It is
 * independent of `MANAGE_TOKEN_SECRET` and carries no PII or signature: an invite is
 * meant to be forwarded, so it must never grant manage/cancel rights. The venue id
 * prefix is not a secret; it lets the public lookup enter the venue (RLS) context
 * before it queries.
 */
const SECRET_BYTES = 16;

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createInvite(input: {
  venueId: string;
  reservationId: string;
}): Promise<{ id: string; token: string }> {
  const token = `${input.venueId}.${randomBytes(SECRET_BYTES).toString("base64url")}`;
  const row = await runWithVenueContext(input.venueId, () =>
    prisma.reservationInvite.create({
      data: {
        venueId: input.venueId,
        reservationId: input.reservationId,
        tokenHash: hashInviteToken(token),
      },
    })
  );
  return { id: row.id, token };
}

/** The live (un-revoked) invite for a token, or null for any malformed or unknown token. */
export async function findLiveInviteByToken(
  token: string
): Promise<{ id: string; venueId: string; reservationId: string } | null> {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const venueId = token.slice(0, dot);
  const row = await runWithVenueContext(venueId, () =>
    prisma.reservationInvite.findFirst({
      where: { tokenHash: hashInviteToken(token), revokedAt: null },
    })
  );
  return row ? { id: row.id, venueId, reservationId: row.reservationId } : null;
}

/** Revokes every live invite on a reservation (called when it is cancelled). */
export async function revokeInvitesForReservation(input: {
  venueId: string;
  reservationId: string;
}): Promise<number> {
  const { count } = await runWithVenueContext(input.venueId, () =>
    prisma.reservationInvite.updateMany({
      where: { reservationId: input.reservationId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  );
  return count;
}
