import type { Guest } from "@mbe/types";
import type { NotificationPort } from "@mbe/notifications";

/**
 * Send a win-back message to a lapsing guest.
 * Skips guests with communicationPreference === "transactional_only".
 *
 * @returns true if message was sent, false if skipped.
 */
export async function sendWinBack(
  guest: Guest,
  notificationPort: NotificationPort
): Promise<boolean> {
  if (guest.communicationPreference === "transactional_only") {
    return false;
  }

  if (!guest.email) {
    return false;
  }

  await notificationPort.sendWinBack({
    guestName: guest.name,
    guestEmail: guest.email,
    venueName: "your favourite restaurant",
  });

  return true;
}
