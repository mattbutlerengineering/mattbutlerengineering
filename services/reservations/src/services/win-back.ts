import type { Guest } from "@mbe/types";
import {
  EmailNotConfiguredError,
  ProviderRejectedError,
  type NotificationDispatcher,
} from "../notifications/index.js";
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
  | { status: "unavailable" }
  | ({ status: "cooldown" } & WinBackCooldown);

export interface WinBackDeps {
  claim(venueId: string, guestId: string, now: Date): Promise<WinBackClaim>;
  markSent(venueId: string, guestId: string, claimedAt: Date, sentAt: Date): Promise<void>;
  release(
    venueId: string,
    guestId: string,
    claimedAt: Date,
    previousClaimedAt: Date | null
  ): Promise<void>;
  now(): Date;
  /** Where a rejection is logged (the request logger). Never given guest contact details. */
  log?: { error(fields: object, message: string): void };
}

export const defaultWinBackDeps: WinBackDeps = {
  claim: (venueId, guestId, now) => claimWinBack(venueId, guestId, now),
  markSent: (venueId, guestId, claimedAt, sentAt) =>
    markWinBackSent(venueId, guestId, claimedAt, sentAt),
  release: (venueId, guestId, claimedAt, previousClaimedAt) =>
    releaseWinBackClaim(venueId, guestId, claimedAt, previousClaimedAt),
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
  deps: WinBackDeps = defaultWinBackDeps
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
    if (!(err instanceof ProviderRejectedError) && !(err instanceof EmailNotConfiguredError)) {
      throw err;
    }
    // Nothing was sent: put the previous claim back so a retry is allowed. The reason is
    // logged (name and message only) so a revoked key or missing config is visible to operators.
    deps.log?.error(
      { err: { name: err.name, message: err.message }, venueId: guest.venueId, guestId: guest.id },
      "win-back not sent"
    );
    await deps.release(guest.venueId, guest.id, claimedAt, claim.previousClaimedAt);
    return { status: err instanceof EmailNotConfiguredError ? "unavailable" : "failed" };
  }

  await deps.markSent(guest.venueId, guest.id, claimedAt, deps.now());
  return { status: "sent" };
}

/**
 * What a refused repeat tells the caller, in words that claim only what the record proves: a
 * confirmed send says sent; a claim with no matching send says one was attempted and may not
 * have gone out.
 */
export function cooldownDetail(guestName: string, c: WinBackCooldown, timeZone: string): string {
  const at = (d: Date) => formatInZone(d, timeZone);
  const next = `Another can be sent after ${at(c.retryAfter)}.`;
  if (c.sentAt !== null && !isUnconfirmed(c.claimedAt, c.sentAt)) {
    return `${guestName} was sent a win-back message on ${at(c.sentAt)}. Nothing was sent now. ${next}`;
  }
  return `A win-back message to ${guestName} was attempted on ${at(c.claimedAt)} and may not have gone out. Nothing was sent now. ${next}`;
}

/** "Oct 30, 2026, 2:00 AM PDT": readable in the venue's own time, never an ISO string. */
function formatInZone(date: Date, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  };
  let text: string;
  try {
    text = new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(date);
  } catch {
    // An unrecognised stored timezone must not turn a refusal into a 500.
    text = new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(date);
  }
  return text.replace(/\u202f/g, " ");
}
