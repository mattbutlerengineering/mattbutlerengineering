import type { Guest } from "@mbe/types";
import type { NotificationDispatcher, CommunicationPreference } from "@mbe/notifications";

/**
 * Send a win-back message to a lapsing guest.
 * Skips guests with communicationPreference === "transactional_only".
 *
 * @returns true if message was sent, false if skipped.
 */
export async function sendWinBack(
  guest: Guest,
  notificationPort: NotificationDispatcher,
  venueName: string
): Promise<boolean> {
  const preference = (guest.communicationPreference ?? "email_only") as CommunicationPreference;

  if (preference === "transactional_only") {
    return false;
  }

  // Win-back is email-only; skip guests who opted into SMS-only
  // communication or have no email address on file.
  if (preference === "sms_only" || !guest.email) {
    return false;
  }

  await notificationPort.sendWinBack(
    {
      guestName: guest.name,
      guestEmail: guest.email,
      venueName,
    },
    preference
  );

  return true;
}
