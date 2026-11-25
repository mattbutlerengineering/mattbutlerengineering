import type { Guest, GuestMember } from "@mbe/types";
import { buildMemberUrl } from "../notifications/manage-url.js";
import type { NotificationDispatcher } from "../notifications/index.js";
import { escapeHtml } from "../notifications/sanitize.js";
import { inviteMember } from "./guest-membership.js";
import { generateMemberToken } from "./member-token.js";

export interface InviteRegularDeps {
  guestService: {
    findOrCreate(venueId: string, data: { email: string; name: string }): Promise<Guest>;
  };
  dispatcher: Pick<NotificationDispatcher, "sendClosureEmail">;
  /** Web origin the member link points at (MANAGE_BASE_URL). */
  baseUrl: string;
  /** Where a send failure is logged. Never given the guest's email. */
  log?: { error(fields: object, message: string): void };
}

export type InviteRegularResult = { status: "sent" | "failed"; member: GuestMember };

/** The wire shape of one member row (dates as ISO strings). */
export function toGuestMember(
  row: {
    id: string;
    guestId: string;
    tier: "REGULAR";
    status: "ACTIVE" | "REVOKED";
    invitedAt: Date;
    revokedAt: Date | null;
  },
  guest: { name: string; email: string | null }
): GuestMember {
  return {
    id: row.id,
    guestId: row.guestId,
    guestName: guest.name,
    guestEmail: guest.email,
    tier: row.tier,
    status: row.status,
    invitedAt: row.invitedAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

/** The invitation email: the signed member link, with every interpolated value escaped. */
export function buildMemberInviteEmail(input: {
  guestName: string;
  venueName: string;
  url: string;
}): { subject: string; html: string } {
  const name = escapeHtml(input.guestName);
  const venue = escapeHtml(input.venueName);
  const url = escapeHtml(input.url);
  return {
    subject: `You're invited to the Regulars Club at ${input.venueName}`,
    html:
      `<p>Hi ${name},</p>` +
      `<p>${venue} has invited you to its Regulars Club. Use your personal link to book with member access.</p>` +
      `<p><a href="${url}">Book as a member</a></p>` +
      `<p>This link is just for you. Please don&apos;t share it.</p>`,
  };
}

/**
 * Invites a guest as a Regular: finds or creates the guest by email in the venue, activates the
 * membership, then emails the signed member link. The membership is kept when the email fails
 * (inviting again is idempotent and re-sends), but the result says `failed` so the caller never
 * reports success for a link that did not go out. Must run inside the venue's context.
 */
export async function inviteRegular(
  input: { venue: { id: string; name: string; slug: string }; email: string; name: string },
  deps: InviteRegularDeps
): Promise<InviteRegularResult> {
  const email = input.email.trim().toLowerCase();
  const guest = await deps.guestService.findOrCreate(input.venue.id, { email, name: input.name });
  const membership = await inviteMember({ venueId: input.venue.id, guestId: guest.id });
  const member = toGuestMember(membership, guest);

  const token = generateMemberToken(input.venue.id, email);
  const url = buildMemberUrl(deps.baseUrl, input.venue.slug, token);
  const { subject, html } = buildMemberInviteEmail({
    guestName: guest.name,
    venueName: input.venue.name,
    url,
  });
  try {
    await deps.dispatcher.sendClosureEmail({ to: email, subject, html });
  } catch (err) {
    deps.log?.error(
      {
        err: { name: (err as Error).name, message: (err as Error).message },
        venueId: input.venue.id,
        guestId: guest.id,
      },
      "regulars club invitation not sent"
    );
    return { status: "failed", member };
  }
  return { status: "sent", member };
}
