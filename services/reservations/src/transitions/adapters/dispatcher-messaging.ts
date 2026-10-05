import type { NotificationDispatcher } from "@mbe/notifications";
import type { CommunicationPreference, Reservation, Venue } from "@mbe/types";
import { resolveChannel } from "../../services/contact-policy.js";
import type { PostVisitNotifier } from "../../services/post-visit-notifier.js";
import type { EffectLogger } from "../run.js";
import type { CancelInitiator, MessagingPort } from "../ports.js";

export interface DispatcherMessagingDeps {
  dispatcher: NotificationDispatcher;
  postVisitNotifier: PostVisitNotifier;
  getVenue: (venueId: string) => Promise<Venue | null>;
  logger?: EffectLogger;
}

/**
 * Production messaging adapter. Each send half moved here verbatim from where
 * it lived before (maintenance:reservation-transition-effects PR 2):
 *
 * - booking-confirmation / booking-cancelled — `services/booking-notifications.ts`
 * - booking-modified — `notifyModification` in `services/reservation-modification.ts`
 * - post-visit-thank-you — the inline block in `routes/reservations.ts`' PATCH handler
 *
 * Each keeps its own venue lookup, channel preference and try/catch, so today's
 * skip and failure semantics carry over: no outbound call when the guest email
 * or venue is missing; a venue lookup that throws rejects; a failed cancelled /
 * modified send is logged, never rethrown.
 */
export function createDispatcherMessaging(deps: DispatcherMessagingDeps): MessagingPort {
  const { dispatcher, postVisitNotifier, getVenue, logger } = deps;

  async function sendBookingConfirmation(
    reservation: Reservation,
    manageToken: string
  ): Promise<void> {
    const { id, venueId, guestEmail, guestPhone, startTime } = reservation;
    if (!guestEmail || !venueId) return;
    const venue = await getVenue(venueId);
    if (!venue) return;
    await dispatcher.sendBookingConfirmation({
      reservationId: id,
      date: reservation.date,
      startTime,
      endTime: reservation.endTime,
      partySize: reservation.partySize,
      guestName: reservation.guestName,
      guestEmail,
      guestPhone: guestPhone ?? null,
      specialRequests: reservation.notes ?? null,
      venueName: venue.name,
      venueTimezone: venue.ianaTimezone,
      venueAddress: null,
      manageToken,
    });
  }

  async function sendBookingCancelled(
    reservation: Reservation,
    manageToken: string,
    initiator: CancelInitiator
  ): Promise<void> {
    const venue = reservation.venueId ? await getVenue(reservation.venueId) : null;
    if (!reservation.guestEmail || !venue) return;

    const preference = resolveChannel(
      reservation.guest?.communicationPreference as CommunicationPreference | null
    );
    try {
      await dispatcher.sendBookingCancelled(
        {
          reservationId: reservation.id,
          date: reservation.date,
          startTime: reservation.startTime,
          endTime: reservation.endTime,
          partySize: reservation.partySize,
          guestName: reservation.guestName,
          guestEmail: reservation.guestEmail,
          guestPhone: reservation.guestPhone ?? null,
          specialRequests: reservation.notes ?? null,
          venueName: venue.name,
          venueTimezone: venue.ianaTimezone,
          venueAddress: null,
          manageToken,
        },
        preference
      );
    } catch (err) {
      logger?.error(
        { err, reservationId: reservation.id, initiator },
        "Failed to send booking cancelled notification"
      );
    }
  }

  async function sendBookingModified(updated: Reservation, manageToken: string): Promise<void> {
    const venue = updated.venueId ? await getVenue(updated.venueId) : null;
    if (!updated.guestEmail || !venue) return;

    const preference = resolveChannel(
      updated.guest?.communicationPreference as CommunicationPreference | null
    );
    try {
      await dispatcher.sendBookingModified(
        {
          reservationId: updated.id,
          date: updated.date,
          startTime: updated.startTime,
          endTime: updated.endTime,
          partySize: updated.partySize,
          guestName: updated.guestName,
          guestEmail: updated.guestEmail,
          guestPhone: updated.guestPhone ?? null,
          specialRequests: updated.notes ?? null,
          venueName: venue.name,
          venueTimezone: venue.ianaTimezone,
          venueAddress: null,
          manageToken,
          sequence: 2,
        },
        preference
      );
    } catch {
      logger?.error({}, "Failed to send booking modified notification");
    }
  }

  async function sendPostVisitThankYou(reservation: Reservation): Promise<void> {
    const venue = reservation.venueId ? await getVenue(reservation.venueId) : null;
    const settings = (venue?.settings ?? {}) as Record<string, unknown>;
    const postVisitEmailEnabled = Boolean(settings.postVisitEmailEnabled);

    await postVisitNotifier.sendPostVisitEmail({
      reservationId: reservation.id,
      guestId: reservation.guestId ?? null,
      guestEmail: reservation.guestEmail ?? null,
      guestFirstName: reservation.guestName?.split(" ")[0] ?? null,
      unsubscribed: Boolean(reservation.guest?.unsubscribed),
      venueName: venue?.name ?? "",
      venuePostVisitEmailEnabled: postVisitEmailEnabled,
      visitDate: reservation.date,
      feedbackUrl: (settings.feedbackUrl as string | null) ?? null,
    });
  }

  return {
    async send(message) {
      switch (message.kind) {
        case "booking-confirmation":
          return sendBookingConfirmation(message.reservation, message.manageToken);
        case "booking-cancelled":
          return sendBookingCancelled(message.reservation, message.manageToken, message.initiator);
        case "booking-modified":
          return sendBookingModified(message.reservation, message.manageToken);
        case "post-visit-thank-you":
          return sendPostVisitThankYou(message.reservation);
      }
    },
  };
}
