import type { FastifyPluginAsync } from "fastify";
import { reservationService } from "../services/reservation.js";
import { venueService } from "../services/venue.js";
import { serializeManagedReservation } from "../services/serializers.js";
import { requireManageToken } from "../middleware/require-manage-token.js";
import { reservationNotFoundProblem } from "./load-reservation-for-manage.js";
import { resolveVenueId } from "../services/resolve-venue.js";
import { runWithVenueContext } from "../services/venue-context-store.js";

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
      // ADR-026 §3.3 item 4: resolve the reservation's venue through the
      // SECURITY DEFINER function rather than an unscoped `reservations`
      // read, then run the actual lookup inside that venue's RLS context. A
      // NULL resolution (reservation gone, or has no venue per ADR-026 §2)
      // is reported the same way a missing reservation already was.
      const venueId = await resolveVenueId("reservation", request.managedReservationId);
      if (!venueId) {
        return reply.status(404).send(reservationNotFoundProblem());
      }

      return runWithVenueContext(venueId, async () => {
        const reservation = await reservationService.getById(request.managedReservationId);
        if (!reservation) {
          return reply.status(404).send(reservationNotFoundProblem());
        }

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
      });
    }
  );
};
