import type { Guest } from "@mbe/types";
import type { NotificationDispatcher } from "@mbe/notifications";
import { canContact, resolveChannel } from "./contact-policy.js";

/**
 * Send a win-back message to a lapsing guest.
 *
 * Consent is delegated to the shared contact-policy: unsubscribed guests and
 * guests whose stored preference opts out of marketing (transactional_only)
 * are skipped. Win-back is email-only, so sms_only guests and guests with no
 * email on file are also skipped — a channel-capability concern, not consent.
 *
 * @returns true if message was sent, false if skipped.
 */
export async function sendWinBack(
  guest: Guest,
  notificationPort: NotificationDispatcher,
  venueName: string
): Promise<boolean> {
  if (
    !canContact(
      {
        unsubscribed: guest.unsubscribed ?? false,
        communicationPreference: guest.communicationPreference,
      },
      "marketing"
    )
  ) {
    return false;
  }

  const channel = resolveChannel(guest.communicationPreference);

  // Win-back is email-only; skip guests who opted into SMS-only
  // communication or have no email address on file.
  if (channel === "sms_only" || !guest.email) {
    return false;
  }

  await notificationPort.sendWinBack(
    {
      guestName: guest.name,
      guestEmail: guest.email,
      venueName,
    },
    channel
  );

  return true;
}
