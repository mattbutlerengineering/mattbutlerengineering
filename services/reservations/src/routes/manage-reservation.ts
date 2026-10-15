import type { FastifyPluginAsync } from "fastify";
import { venueService } from "../services/venue.js";
import { serializeManagedReservation } from "../services/serializers.js";
import { manageTokenScoped } from "./manage-token-scope.js";
import { reservationNotFoundProblem } from "./load-reservation-for-manage.js";

export const manageReservationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { token?: string } }>(
    "/public/v1/reservations/manage",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    // ADR-026 §3.3 item 4: the scope verifies the token, resolves the venue
    // and loads the reservation once, inside that venue's RLS context.
    manageTokenScoped(
      { missing: (reply) => reply.status(404).send(reservationNotFoundProblem()) },
      async (_request, reply, { venueId, reservation }) => {
        const venue = await venueService.getById(venueId);

        return reply.status(200).send({
          data: {
            reservation: serializeManagedReservation(reservation),
            venue: venue
              ? {
                  id: venue.id,
                  name: venue.name,
                  slug: venue.slug,
                  ianaTimezone: venue.ianaTimezone,
                  phone: venue.settings?.phone,
                }
              : null,
          },
        });
      }
    )
  );
};
