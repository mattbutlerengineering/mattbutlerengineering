import type { FastifyPluginAsync } from "fastify";
import { reservationService } from "../services/reservation.js";
import { venueService } from "../services/venue.js";
import { depositService } from "../services/deposit.js";
import { requireManageToken } from "../middleware/require-manage-token.js";
import { evaluateCancellationFee } from "../services/cancellation-policy.js";

export const cancelReservationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.delete<{ Querystring: { token?: string } }>(
    "/public/v1/reservations/manage",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
      preHandler: requireManageToken,
    },
    async (request, reply) => {
      const reservation = await reservationService.getById(request.managedReservationId);
      if (!reservation) {
        return reply.status(404).send({
          type: "about:blank",
          title: "Reservation Not Found",
          status: 404,
          detail: "Reservation not found",
        });
      }

      if (reservation.status === "CANCELLED") {
        return reply.status(409).send({
          type: "about:blank",
          title: "Already Cancelled",
          status: 409,
          detail: "This reservation is already cancelled",
        });
      }

      if (reservation.status === "COMPLETED") {
        return reply.status(409).send({
          type: "about:blank",
          title: "Cannot Cancel",
          status: 409,
          detail: "Cannot cancel a completed reservation",
        });
      }

      const updated = await reservationService.update(reservation.id, {
        status: "CANCELLED",
      });

      if (!updated) {
        return reply.status(500).send({
          type: "about:blank",
          title: "Update Failed",
          status: 500,
          detail: "Failed to cancel reservation",
        });
      }

      // Apply cancellation policy to any held deposit
      const deposit = await depositService.getByReservationId(reservation.id);
      if (deposit && deposit.status === "held") {
        const rawVenue = reservation.venueId
          ? await venueService.getRawById(reservation.venueId)
          : null;

        const policy =
          rawVenue?.freeCancellationHours != null
            ? {
                depositAmountCents: deposit.amountCents,
                freeCancellationHours: rawVenue.freeCancellationHours,
                lateCancellationFeePercent: rawVenue.lateCancellationFeePercent ?? null,
                noShowFeePercent: rawVenue.noShowFeePercent ?? null,
              }
            : null;

        const reservationTime = new Date(reservation.startTime);
        const cancellationTime = new Date();
        const feeResult = evaluateCancellationFee(policy, reservationTime, cancellationTime);

        try {
          if (feeResult.depositAction === "refund_full") {
            await depositService.refund(deposit.id);
          } else if (feeResult.depositAction === "forfeit") {
            await depositService.forfeit(deposit.id);
          } else {
            // refund_partial: capture then partially refund
            await depositService.refundPartial(deposit.id, feeResult.refundAmountCents);
          }
        } catch (err) {
          request.log.error({ err }, "Failed to process deposit on cancellation");
        }
      }

      const venue = reservation.venueId ? await venueService.getById(reservation.venueId) : null;

      // Cancel any pending reminder jobs for this reservation
      fastify.bookingNotifier
        .cancelBookingReminders(reservation.id)
        .catch((err) => fastify.log.error({ err }, "Failed to cancel booking reminders"));

      if (reservation.guestEmail && venue) {
        const preference =
          (reservation.guest?.communicationPreference as
            | "email_only"
            | "sms_only"
            | "both"
            | "transactional_only"
            | null) ?? "email_only";
        try {
          await fastify.notificationPort.sendBookingCancelled(
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
              manageToken: request.query.token!,
            },
            preference
          );
        } catch {
          request.log.error("Failed to send booking cancelled notification");
        }
      }

      return reply.status(200).send({
        data: { status: updated.status },
      });
    }
  );
};
