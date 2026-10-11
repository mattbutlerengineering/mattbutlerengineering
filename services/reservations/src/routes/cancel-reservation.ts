import type { FastifyPluginAsync } from "fastify";
import { createProblemDetails, cancelReservationBodyJsonSchema } from "@mbe/types";
import { requireManageToken } from "../middleware/require-manage-token.js";
import {
  loadReservationForManage,
  manageProblemDetails,
  reservationNotFoundProblem,
} from "./load-reservation-for-manage.js";
import { resolveVenueId } from "../services/resolve-venue.js";
import { runWithVenueContext } from "../services/venue-context-store.js";

export const cancelReservationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.delete<{
    Body?: { cancellationReason?: string; cancellationNote?: string };
  }>(
    "/public/v1/reservations/manage",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
      schema: {
        body: cancelReservationBodyJsonSchema,
      },
      // A bare DELETE with no body at all (the common case — most guests
      // cancel without giving a reason) leaves `request.body` as `undefined`,
      // which the AJV "object" type check rejects before the handler ever
      // runs. Default it to `{}` so the schema below only constrains a body
      // that was actually sent, not the common no-body request.
      preValidation: async (request) => {
        if (request.body === undefined) {
          request.body = {};
        }
      },
      preHandler: requireManageToken,
    },
    async (request, reply) => {
      // ADR-026 §3.3 item 4: resolve the reservation's venue through the
      // SECURITY DEFINER function, then run the whole cancel flow inside
      // that venue's RLS context.
      const venueId = await resolveVenueId("reservation", request.managedReservationId);
      if (!venueId) {
        return reply.status(404).send(reservationNotFoundProblem());
      }

      return runWithVenueContext(venueId, async () => {
        const preamble = await loadReservationForManage(request.managedReservationId);
        if (!preamble.ok) {
          return reply.status(preamble.status).send(manageProblemDetails(preamble, "cancel"));
        }

        const result = await fastify.transitions.cancel(preamble.reservation, {
          door: "guest-manage",
          initiator: "guest",
          manageToken: request.manageToken,
          reason: request.body?.cancellationReason,
          note: request.body?.cancellationNote,
          log: request.log,
        });

        if (!result.success) {
          return reply
            .status(result.status)
            .send(createProblemDetails(result.status, result.title, result.detail));
        }

        return reply.status(200).send({
          data: { status: result.reservation.status },
        });
      });
    }
  );
};
