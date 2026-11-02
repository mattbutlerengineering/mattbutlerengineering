import type { Guest } from "@mbe/types";
import type { NotificationDispatcher } from "../notifications/index.js";
import { canContact, resolveChannel } from "./contact-policy.js";
import { claimWinBack, type WinBackClaim } from "./win-back-store.js";

export type WinBackResult =
  { status: "sent" } | { status: "skipped" } | { status: "cooldown"; lastSentAt: Date };

export interface WinBackDeps {
  claim(venueId: string, guestId: string, now: Date): Promise<WinBackClaim>;
  now(): Date;
}

const defaultDeps: WinBackDeps = {
  claim: (venueId, guestId, now) => claimWinBack(venueId, guestId, now),
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
 * The send is recorded (claimed) BEFORE the provider is called, and the claim
 * is not released if the call then fails or the process dies between the two.
 * That is a deliberate at-most-once choice: the provider may have delivered
 * despite the error, and a duplicate marketing email is worse than a missed
 * one. The next attempt inside the cooldown is refused (`cooldown`, carrying
 * the recorded time), and the key given to the provider is derived from the
 * claim, so a provider-level retry of the same claim cannot send twice either.
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

  const now = deps.now();
  const claim = await deps.claim(guest.venueId, guest.id, now);
  if (!claim.claimed) return { status: "cooldown", lastSentAt: claim.lastSentAt };

  await notificationPort.sendWinBack(
    {
      guestName: guest.name,
      guestEmail: guest.email,
      venueName,
      idempotencyKey: `win-back/${guest.id}/${now.toISOString()}`,
    },
    channel
  );

  return { status: "sent" };
}
