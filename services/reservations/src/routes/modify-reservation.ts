import type { FastifyPluginAsync } from "fastify";
import { createProblemDetails } from "@mbe/types";
import { requireManageToken } from "../middleware/require-manage-token.js";
import { loadReservationForManage, manageProblemDetails } from "./load-reservation-for-manage.js";
import { modifyReservationWithNotifications } from "../services/reservation-modification.js";
import { serializeManagedReservation } from "../services/serializers.js";

interface ModifyBody {
  date?: string;
  startTime?: string;
  endTime?: string;
  partySize?: number;
  specialRequests?: string;
}

export const modifyReservationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.patch<{ Querystring: { token?: string }; Body: ModifyBody }>(
    "/public/v1/reservations/manage",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
      preHandler: requireManageToken,
    },
    async (request, reply) => {
      const preamble = await loadReservationForManage(request.managedReservationId);
      if (!preamble.ok) {
        return reply.status(preamble.status).send(manageProblemDetails(preamble, "modify"));
      }

      const result = await modifyReservationWithNotifications(
        preamble.reservation,
        request.body ?? {},
        request.query.token!,
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
    }
  );
};
