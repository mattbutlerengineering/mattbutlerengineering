import type { FastifyPluginAsync } from "fastify";
import { requireManageToken } from "../middleware/require-manage-token.js";
import { loadReservationForManage } from "./load-reservation-for-manage.js";
import { cancelReservationWithDeposit } from "../services/reservation-cancellation.js";

const NOT_OK_MESSAGES = {
  not_found: { title: "Reservation Not Found", detail: "Reservation not found" },
  cancelled: { title: "Already Cancelled", detail: "This reservation is already cancelled" },
  completed: { title: "Cannot Cancel", detail: "Cannot cancel a completed reservation" },
} as const;

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
        const { title, detail } = NOT_OK_MESSAGES[preamble.reason];
        return reply.status(preamble.status).send({
          type: "about:blank",
          title,
          status: preamble.status,
          detail,
        });
      }

      const result = await cancelReservationWithDeposit(
        preamble.reservation,
        request.query.token!,
        {
          bookingNotifier: fastify.bookingNotifier,
          notificationPort: fastify.notificationPort,
          logger: request.log,
        }
      );

      if (!result.success) {
        return reply.status(result.status).send({
          type: "about:blank",
          title: result.title,
          status: result.status,
          detail: result.detail,
        });
      }

      return reply.status(200).send({
        data: { status: result.reservation.status },
      });
    }
  );
};
