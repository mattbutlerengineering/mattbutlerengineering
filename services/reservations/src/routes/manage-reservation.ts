import type { FastifyPluginAsync } from "fastify";
import { reservationService } from "../services/reservation.js";
import { venueService } from "../services/venue.js";
import { requireManageToken } from "../middleware/require-manage-token.js";

export const manageReservationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { token?: string } }>(
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
