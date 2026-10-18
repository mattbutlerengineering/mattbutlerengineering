import type { FastifyPluginAsync } from "fastify";
import { cancelReservationBodyJsonSchema, createProblemDetails } from "@mbe/types";
import {
  guardManageState,
  manageProblemDetails,
  reservationNotFoundProblem,
} from "./load-reservation-for-manage.js";
import { manageTokenScoped } from "./manage-token-scope.js";
import { guestActor } from "../services/reservation-events.js";

export const cancelReservationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.delete<{
    Body?: { cancellationReason?: string; cancellationNote?: string };
  }>(
    "/public/v1/reservations/manage",
    {
      schema: {
        body: cancelReservationBodyJsonSchema,
      },
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
      // The body is optional: Ajv rejects an undefined body against an object
      // schema, so default an omitted one to {} before validation runs.
      preValidation: async (request) => {
        if (request.body === undefined) {
          request.body = {};
        }
      },
    },
    // ADR-026 §3.3 item 4: the scope verifies the token, resolves the venue
    // and loads the reservation once; the whole cancel flow runs inside that
    // venue's RLS context.
    manageTokenScoped(
      { missing: (reply) => reply.status(404).send(reservationNotFoundProblem()) },
      async (request, reply, { reservation, token }) => {
        const preamble = guardManageState(reservation);
        if (!preamble.ok) {
          return reply.status(preamble.status).send(manageProblemDetails(preamble, "cancel"));
        }

        const result = await fastify.transitions.cancel(preamble.reservation, {
          door: "guest-manage",
          initiator: "guest",
          manageToken: token,
          reason: request.body?.cancellationReason,
          note: request.body?.cancellationNote,
          actor: guestActor(preamble.reservation.guestId),
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
      }
    )
  );
};
