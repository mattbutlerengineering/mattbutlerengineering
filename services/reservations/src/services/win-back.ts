import type { Guest } from "@mbe/types";
import { ProviderRejectedError, type NotificationDispatcher } from "../notifications/index.js";
import { canContact, resolveChannel } from "./contact-policy.js";
import {
  claimWinBack,
  markWinBackSent,
  releaseWinBackClaim,
  WIN_BACK_COOLDOWN_MS,
  isUnconfirmed,
  type WinBackClaim,
} from "./win-back-store.js";

export interface WinBackCooldown {
  /** When the refusing claim was made. */
  claimedAt: Date;
  /** When the provider last accepted a send; may predate `claimedAt`. */
  sentAt: Date | null;
  /** The earliest time another send is allowed. */
  retryAfter: Date;
}

export type WinBackResult =
  | { status: "sent" }
  | { status: "skipped" }
  | { status: "failed" }
  | ({ status: "cooldown" } & WinBackCooldown);

export interface WinBackDeps {
  claim(venueId: string, guestId: string, now: Date): Promise<WinBackClaim>;
  markSent(venueId: string, guestId: string, claimedAt: Date, sentAt: Date): Promise<void>;
  release(venueId: string, guestId: string, claimedAt: Date): Promise<void>;
  now(): Date;
}

const defaultDeps: WinBackDeps = {
  claim: (venueId, guestId, now) => claimWinBack(venueId, guestId, now),
  markSent: (venueId, guestId, claimedAt, sentAt) =>
    markWinBackSent(venueId, guestId, claimedAt, sentAt),
  release: (venueId, guestId, claimedAt) => releaseWinBackClaim(venueId, guestId, claimedAt),
  now: () => new Date(),
};

/**
 * Send a win-back message to a lapsing guest, at most once per cooldown.
 *
 * Consent is delegated to the shared contact-policy: unsubscribed guests and
 * guests whose stored preference opts out of marketing (transactional_only)
 * are skipped. Win-back is email-only, so sms_only guests and guests with no
 * email on file are also skipped — a channel-capability concern, not consent.
 * A skipped guest is never claimed, so a skip starts no cooldown.
 *
 * The send is claimed BEFORE the provider is called, so two simultaneous sends
 * cannot both go out. What happens next depends on what is known:
 * - the provider accepted it: `sentAt` is recorded (the only proof an email went);
 * - the provider definitely rejected it (`ProviderRejectedError`, nothing was
 *   sent): the claim is released so a retry can claim at once, and the result
 *   is `failed`;
 * - anything else (timeout, dropped connection, a crash between claim and
 *   result): nobody knows whether it was delivered, so the claim is KEPT and a
 *   resend is blocked for the cooldown. A duplicate marketing email is worse
 *   than a missed one. The claim then has no matching `sentAt`, which is how
 *   reads tell an unconfirmed attempt from a confirmed send.
 *
 * The key given to the provider is derived from the claim. It protects only
 * against that one request being replayed (an SDK or intermediary retry): a
 * new attempt, even after a release, makes a new claim and so a new key.
 *
 * Must run inside the guest's venue context (the route is `venueScoped`).
 */
export async function sendWinBack(
  guest: Guest,
  notificationPort: NotificationDispatcher,
  venueName: string,
  deps: WinBackDeps = defaultDeps
): Promise<WinBackResult> {
  if (
    !canContact(
      {
        unsubscribed: guest.unsubscribed ?? false,
        communicationPreference: guest.communicationPreference,
      },
      "marketing"
    )
  ) {
    return { status: "skipped" };
  }

  const channel = resolveChannel(guest.communicationPreference);

  // Win-back is email-only; skip guests who opted into SMS-only
  // communication or have no email address on file.
  if (channel === "sms_only" || !guest.email) {
    return { status: "skipped" };
  }

  const claimedAt = deps.now();
  const claim = await deps.claim(guest.venueId, guest.id, claimedAt);
  if (!claim.claimed) {
    const refusedAt = claim.claimedAt ?? claimedAt;
    return {
      status: "cooldown",
      claimedAt: refusedAt,
      sentAt: claim.sentAt,
      retryAfter: new Date(refusedAt.getTime() + WIN_BACK_COOLDOWN_MS),
    };
  }

  try {
    await notificationPort.sendWinBack(
      {
        guestName: guest.name,
        guestEmail: guest.email,
        venueName,
        idempotencyKey: `win-back/${guest.id}/${claimedAt.toISOString()}`,
      },
      channel
    );
  } catch (err) {
    if (!(err instanceof ProviderRejectedError)) throw err;
    await deps.release(guest.venueId, guest.id, claimedAt);
    return { status: "failed" };
  }

  await deps.markSent(guest.venueId, guest.id, claimedAt, deps.now());
  return { status: "sent" };
}

/**
 * What a refused repeat tells the caller, in words that claim only what the record proves: a
 * confirmed send says sent; a claim with no matching send says one was attempted and may not
 * have gone out.
 */
export function cooldownDetail(guestName: string, c: WinBackCooldown): string {
  const next = `Another can be sent after ${c.retryAfter.toISOString()}.`;
  if (c.sentAt !== null && !isUnconfirmed(c.claimedAt, c.sentAt)) {
    return `${guestName} was sent a win-back message on ${c.sentAt.toISOString()}. Nothing was sent now. ${next}`;
  }
  return `A win-back message to ${guestName} was attempted on ${c.claimedAt.toISOString()} and may not have gone out. Nothing was sent now. ${next}`;
}
