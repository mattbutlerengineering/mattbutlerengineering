import type { FastifyPluginAsync } from "fastify";
import { createProblemDetails, modifyReservationBodyJsonSchema } from "@mbe/types";
import {
  guardManageState,
  manageProblemDetails,
  reservationNotFoundProblem,
} from "./load-reservation-for-manage.js";
import { manageTokenScoped } from "./manage-token-scope.js";
import { serializeManagedReservation } from "../services/serializers.js";

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
    },
    // ADR-026 §3.3 item 4: the scope verifies the token, resolves the venue
    // and loads the reservation once; the whole modify flow runs inside that
    // venue's RLS context.
    manageTokenScoped(
      { missing: (reply) => reply.status(404).send(reservationNotFoundProblem()) },
      async (request, reply, { reservation, token }) => {
        const preamble = guardManageState(reservation);
        if (!preamble.ok) {
          return reply.status(preamble.status).send(manageProblemDetails(preamble, "modify"));
        }

        const result = await fastify.transitions.modifyByGuest(
          preamble.reservation,
          request.body ?? {},
          token
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
      }
    )
  );
};
