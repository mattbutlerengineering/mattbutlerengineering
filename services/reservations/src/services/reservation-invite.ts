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

type LiveInvite =
  | {
      kind: "ok";
      inviteId: string;
      venueId: string;
      reservation: {
        startTime: Date;
        partySize: number;
        status: string;
        venue: { name: string; slug: string; ianaTimezone: string };
      };
    }
  | { kind: "gone" }
  | { kind: "missing" };

/** Must run inside the venue context. Unknown: `missing`. Revoked, cancelled or past: `gone`. */
async function resolveLiveInvite(token: string, venueId: string, now: Date): Promise<LiveInvite> {
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
  return {
    kind: "ok",
    inviteId: invite.id,
    venueId,
    reservation: { ...reservation, venue: reservation.venue },
  };
}

/**
 * Resolves an invite token to its public view (The Invitation, #8662). Unknown or malformed
 * token: `missing`. Revoked, cancelled or past reservation: `gone`. RSVPs are first name and
 * status only (#8663).
 */
export async function getInvitePublicView(
  token: string,
  now: Date = new Date()
): Promise<InviteLookup> {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return { kind: "missing" };
  const venueId = token.slice(0, dot);
  return runWithVenueContext(venueId, async (): Promise<InviteLookup> => {
    const live = await resolveLiveInvite(token, venueId, now);
    if (live.kind !== "ok") return live;
    const { reservation } = live;
    const rsvps = await prisma.reservationRsvp.findMany({
      where: { inviteId: live.inviteId },
      orderBy: { createdAt: "asc" },
    });
    const { date, time } = localParts(reservation.startTime, reservation.venue.ianaTimezone);
    return {
      kind: "ok",
      view: {
        venue: { name: reservation.venue.name, slug: reservation.venue.slug },
        date,
        time,
        partySize: reservation.partySize,
        rsvps: rsvps.map((r) => ({ firstName: r.firstName, status: r.status })),
        status: reservation.status,
      },
    };
  });
}

/** Guests may RSVP up to this many beyond the booked party size (plus-ones). */
export const RSVP_EXTRA_SLOTS = 2;

export type RsvpResult = { kind: "ok" } | { kind: "full" } | { kind: "gone" } | { kind: "missing" };

/**
 * Records one RSVP (first name and IN/OUT only, no contact data) on a live invite (#8663).
 * Capped at partySize + {@link RSVP_EXTRA_SLOTS}. The cap check is count-then-insert, so two
 * simultaneous writes at the boundary can overshoot by one; the per-IP rate limit bounds it.
 */
export async function addInviteRsvp(
  token: string,
  input: { firstName: string; status: "IN" | "OUT" },
  now: Date = new Date()
): Promise<RsvpResult> {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return { kind: "missing" };
  const venueId = token.slice(0, dot);
  return runWithVenueContext(venueId, async (): Promise<RsvpResult> => {
    const live = await resolveLiveInvite(token, venueId, now);
    if (live.kind !== "ok") return live;
    const taken = await prisma.reservationRsvp.count({ where: { inviteId: live.inviteId } });
    if (taken >= live.reservation.partySize + RSVP_EXTRA_SLOTS) return { kind: "full" };
    await prisma.reservationRsvp.create({
      data: {
        venueId,
        inviteId: live.inviteId,
        firstName: input.firstName,
        status: input.status,
      },
    });
    return { kind: "ok" };
  });
}
