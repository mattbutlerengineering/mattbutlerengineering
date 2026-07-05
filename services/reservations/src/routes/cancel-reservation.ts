import type { FastifyPluginAsync } from "fastify";
import { createProblemDetails } from "@mbe/types";
import { requireManageToken } from "../middleware/require-manage-token.js";
import { loadReservationForManage, manageProblemDetails } from "./load-reservation-for-manage.js";
import { cancelReservationWithDeposit } from "../services/reservation-cancellation.js";

export const cancelReservationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.delete<{ Querystring: { token?: string } }>(
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
        return reply.status(preamble.status).send(manageProblemDetails(preamble, "cancel"));
      }

      const result = await cancelReservationWithDeposit(
        preamble.reservation,
        request.query.token!,
        {
          bookingNotifier: fastify.bookingNotifier,
          logger: request.log,
        }
      );

      if (!result.success) {
        return reply
          .status(result.status)
          .send(createProblemDetails(result.status, result.title, result.detail));
      }

      return reply.status(200).send({
        data: { status: result.reservation.status },
      });
    }
  );
};
