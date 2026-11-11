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

/** The only fields an invite link may reveal. Never the booker's identity, notes or ids. */
export interface InvitePublicView {
  venue: { name: string; slug: string };
  date: string;
  time: string;
  partySize: number;
  rsvps: Array<{ firstName: string; status: string }>;
  status: string;
}

export type InviteLookup =
  { kind: "ok"; view: InvitePublicView } | { kind: "gone" } | { kind: "missing" };

function localParts(at: Date, timeZone: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/**
 * Resolves an invite token to its public view (The Invitation, #8662). Unknown or malformed
 * token: `missing`. Revoked, cancelled or past reservation: `gone`. RSVPs arrive with #8663,
 * so the list is empty until then.
 */
export async function getInvitePublicView(
  token: string,
  now: Date = new Date()
): Promise<InviteLookup> {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return { kind: "missing" };
  const venueId = token.slice(0, dot);
  return runWithVenueContext(venueId, async (): Promise<InviteLookup> => {
    const invite = await prisma.reservationInvite.findFirst({
      where: { tokenHash: hashInviteToken(token) },
    });
    if (!invite) return { kind: "missing" };
    if (invite.revokedAt) return { kind: "gone" };
    const reservation = await prisma.reservation.findFirst({
      where: { id: invite.reservationId, venueId },
      select: {
        startTime: true,
        endTime: true,
        partySize: true,
        status: true,
        venue: { select: { name: true, slug: true, ianaTimezone: true } },
      },
    });
    if (!reservation?.venue) return { kind: "missing" };
    if (reservation.status === "CANCELLED" || reservation.endTime.getTime() < now.getTime()) {
      return { kind: "gone" };
    }
    const { date, time } = localParts(reservation.startTime, reservation.venue.ianaTimezone);
    return {
      kind: "ok",
      view: {
        venue: { name: reservation.venue.name, slug: reservation.venue.slug },
        date,
        time,
        partySize: reservation.partySize,
        rsvps: [],
        status: reservation.status,
      },
    };
  });
}
