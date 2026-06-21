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

      // Resolve any held deposit BEFORE flipping the reservation to CANCELLED.
      // A deposit and a reservation must never diverge: cancelling the
      // reservation while leaving the deposit `held` would strand the guest's
      // money (a "ghost" charge with no path to refund). On a money-path
      // failure we surface a 500 and leave both records untouched so the guest
      // can retry rather than silently swallowing the error.
      const deposit = await depositService.getByReservationId(reservation.id);

      // Retry guard: a previous attempt succeeded on capture but failed on refund,
      // leaving the deposit in `partial_refunded`. Re-deriving the action from the
      // current clock risks crossing the no-show boundary and calling forfeit() on
      // an already-captured deposit (DepositTransitionError → permanent 500).
      // Replay refundPartial using the PERSISTED amounts instead.
      if (deposit && deposit.status === "partial_refunded") {
        if (deposit.refundAmountCents == null) {
          // Deposit is partial_refunded but has no persisted amounts — data integrity
          // gap that cannot be safely replayed. Surface a 500.
          request.log.error(
            { depositId: deposit.id, reservationId: reservation.id },
            "partial_refunded deposit missing persisted refund amount; cannot replay"
          );
          return reply.status(500).send({
            type: "about:blank",
            title: "Cancellation Failed",
            status: 500,
            detail: "Could not process the deposit refund. The reservation was not cancelled.",
          });
        }
        try {
          await depositService.refundPartial(deposit.id, deposit.refundAmountCents);
        } catch (err) {
          request.log.error(
            { err, reservationId: reservation.id, depositId: deposit.id },
            "Failed to replay partial refund on cancellation retry; aborting cancel"
          );
          return reply.status(500).send({
            type: "about:blank",
            title: "Cancellation Failed",
            status: 500,
            detail: "Could not process the deposit refund. The reservation was not cancelled.",
          });
        }
      } else if (deposit && deposit.status === "held") {
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
            // refund_partial: capture then partially refund (also covers a
            // partial no-show where noShowFeePercent < 100).
            await depositService.refundPartial(deposit.id, feeResult.refundAmountCents);
          }
        } catch (err) {
          // Do NOT cancel the reservation — keep deposit + reservation
          // consistent. Log structured context for triage and surface an error.
          request.log.error(
            { err, reservationId: reservation.id, depositId: deposit.id },
            "Failed to process deposit on cancellation; aborting cancel to avoid ghost state"
          );
          return reply.status(500).send({
            type: "about:blank",
            title: "Cancellation Failed",
            status: 500,
            detail: "Could not process the deposit refund. The reservation was not cancelled.",
          });
        }
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
