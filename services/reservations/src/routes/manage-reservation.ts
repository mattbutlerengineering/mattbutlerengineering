import type { FastifyPluginAsync } from "fastify";
import { verifyManageToken } from "./public-reservations.js";
import { reservationService } from "../services/reservation.js";
import { venueService } from "../services/venue.js";

export const manageReservationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { token?: string } }>(
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

      const venue = reservation.venueId ? await venueService.getById(reservation.venueId) : null;

      return reply.status(200).send({
        data: {
          reservation: {
            id: reservation.id,
            date: reservation.date,
            startTime: reservation.startTime,
            endTime: reservation.endTime,
            partySize: reservation.partySize,
            guestName: reservation.guestName,
            guestEmail: reservation.guestEmail,
            guestPhone: reservation.guestPhone,
            status: reservation.status,
            notes: reservation.notes,
          },
          venue: venue
            ? { id: venue.id, name: venue.name, slug: venue.slug, ianaTimezone: venue.ianaTimezone }
            : null,
        },
      });
    }
  );
};
