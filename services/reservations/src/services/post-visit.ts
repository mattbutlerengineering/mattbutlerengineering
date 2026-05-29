import type { NotificationPort } from "@mbe/notifications";
import { prisma } from "./database.js";

interface ReservationForEmail {
  id: string;
  guestEmail: string | null;
  date: Date;
}

interface GuestForEmail {
  name: string;
  email: string | null;
  unsubscribed: boolean;
}

interface VenueForEmail {
  name: string;
  postVisitEmailEnabled: boolean;
}

/**
 * Sends a post-visit thank-you email after reservation is COMPLETED.
 * Skips if venue has postVisitEmailEnabled=false or guest is unsubscribed.
 * Updates reservation.emailStatus to SENT or FAILED.
 * Never throws — errors are logged and tracked via emailStatus.
 */
export async function sendPostVisitEmail(
  reservation: ReservationForEmail,
  guest: GuestForEmail,
  venue: VenueForEmail,
  notificationPort: NotificationPort
): Promise<void> {
  if (!venue.postVisitEmailEnabled) return;
  if (guest.unsubscribed) return;

  const email = reservation.guestEmail;
  if (!email) return;

  const firstName = guest.name.split(" ")[0] ?? null;
  const reservationDate = reservation.date.toISOString().slice(0, 10);

  try {
    await notificationPort.sendPostVisitThankYou({
      guestEmail: email,
      guestFirstName: firstName,
      venueName: venue.name,
      reservationDate,
    });
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { emailStatus: "SENT" },
    });
  } catch {
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { emailStatus: "FAILED" },
    });
  }
}

/**
 * Fire-and-forget helper called from route handlers after a COMPLETED transition.
 * Loads guest + venue from DB, then delegates to sendPostVisitEmail.
 * Swallows all errors — never blocks the response.
 */
export function triggerPostVisitEmail(
  reservationId: string,
  guestId: string | null,
  venueId: string | null,
  guestEmail: string | null,
  reservationDate: Date,
  notificationPort: NotificationPort,
  logger: { error: (msg: string, err: unknown) => void }
): void {
  if (!venueId || !guestId || !guestEmail) return;

  void (async () => {
    try {
      const [guest, venue] = await Promise.all([
        prisma.guest.findUnique({
          where: { id: guestId },
          select: { name: true, email: true, unsubscribed: true },
        }),
        prisma.venue.findUnique({
          where: { id: venueId },
          select: { name: true, postVisitEmailEnabled: true },
        }),
      ]);

      if (!guest || !venue) return;

      await sendPostVisitEmail(
        { id: reservationId, guestEmail, date: reservationDate },
        guest,
        venue,
        notificationPort
      );
    } catch (err) {
      logger.error("post-visit email trigger failed", err);
    }
  })();
}
