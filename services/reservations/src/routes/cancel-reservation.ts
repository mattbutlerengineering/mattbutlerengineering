import type { FastifyPluginAsync } from "fastify";
import { verifyManageToken } from "./public-reservations.js";
import { reservationService } from "../services/reservation.js";
import { venueService } from "../services/venue.js";

export const cancelReservationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.delete<{ Querystring: { token?: string } }>(
    "/public/v1/reservations/manage",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const { token } = request.query;

      if (!token) {
        return reply.status(400).send({
          type: "about:blank",
          title: "Missing Token",
          status: 400,
          detail: "Token query parameter is required",
        });
      }

      const result = verifyManageToken(token);

      if (!result.valid && result.expired) {
        return reply.status(410).send({
          type: "about:blank",
          title: "Token Expired",
          status: 410,
          detail: "This manage link has expired",
        });
      }

      if (!result.valid) {
        return reply.status(401).send({
          type: "about:blank",
          title: "Invalid Token",
          status: 401,
          detail: "Invalid or malformed token",
        });
      }

      const reservation = await reservationService.getById(result.reservationId!);
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

      const venue = reservation.venueId ? await venueService.getById(reservation.venueId) : null;

      if (reservation.guestEmail && venue) {
        try {
          await fastify.notificationPort.sendBookingCancelled({
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
            manageToken: token,
          });
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
