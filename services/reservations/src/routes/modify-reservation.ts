import type { FastifyPluginAsync } from "fastify";
import { createProblemDetails, modifyReservationBodyJsonSchema } from "@mbe/types";
import { requireManageToken } from "../middleware/require-manage-token.js";
import {
  loadReservationForManage,
  manageProblemDetails,
  reservationNotFoundProblem,
} from "./load-reservation-for-manage.js";
import { modifyReservationWithNotifications } from "../services/reservation-modification.js";
import { serializeManagedReservation } from "../services/serializers.js";
import { resolveVenueId } from "../services/resolve-venue.js";
import { runWithVenueContext } from "../services/venue-context-store.js";

interface ModifyBody {
  date?: string;
  startTime?: string;
  endTime?: string;
  partySize?: number;
  specialRequests?: string;
}

export const modifyReservationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.patch<{ Body: ModifyBody }>(
    "/public/v1/reservations/manage",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
      schema: {
        body: modifyReservationBodyJsonSchema,
      },
      preHandler: requireManageToken,
    },
    async (request, reply) => {
      // ADR-026 §3.3 item 4: resolve the reservation's venue through the
      // SECURITY DEFINER function, then run the whole modify flow inside
      // that venue's RLS context.
      const venueId = await resolveVenueId("reservation", request.managedReservationId);
      if (!venueId) {
        return reply.status(404).send(reservationNotFoundProblem());
      }

      return runWithVenueContext(venueId, async () => {
        const preamble = await loadReservationForManage(request.managedReservationId);
        if (!preamble.ok) {
          return reply.status(preamble.status).send(manageProblemDetails(preamble, "modify"));
        }

        const result = await modifyReservationWithNotifications(
          preamble.reservation,
          request.body ?? {},
          request.manageToken,
          {
            bookingNotifier: fastify.bookingNotifier,
            notificationPort: fastify.notificationPort,
            logger: request.log,
          }
        );

        if (!result.success) {
          return reply.status(result.status).send(
            createProblemDetails(
              result.status,
              result.title,
              result.detail,
              "about:blank",
              undefined,
              {
                code: result.code,
              }
            )
          );
        }

        return reply.status(200).send({
          data: {
            reservation: serializeManagedReservation(result.reservation),
          },
        });
      });
    }
  );
};
