import type { FastifyPluginAsync } from "fastify";
import { reservationService } from "../services/reservation.js";
import { venueService } from "../services/venue.js";
import { serializeManagedReservation } from "../services/serializers.js";
import { requireManageToken } from "../middleware/require-manage-token.js";
import { reservationNotFoundProblem } from "./load-reservation-for-manage.js";

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
        return reply.status(404).send(reservationNotFoundProblem());
      }

      const venue = reservation.venueId ? await venueService.getById(reservation.venueId) : null;

      return reply.status(200).send({
        data: {
          reservation: serializeManagedReservation(reservation),
          venue: venue
            ? { id: venue.id, name: venue.name, slug: venue.slug, ianaTimezone: venue.ianaTimezone }
            : null,
        },
      });
    }
  );
};
