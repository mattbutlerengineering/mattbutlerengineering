import type { FastifyPluginAsync } from "fastify";
import { createProblemDetails } from "@mbe/types";
import { requireManageToken } from "../middleware/require-manage-token.js";
import { loadReservationForManage } from "./load-reservation-for-manage.js";
import { modifyReservationWithNotifications } from "../services/reservation-modification.js";

interface ModifyBody {
  date?: string;
  startTime?: string;
  endTime?: string;
  partySize?: number;
  specialRequests?: string;
}

const NOT_OK_MESSAGES = {
  not_found: {
    title: "Reservation Not Found",
    detail: "Reservation not found",
    code: "RESERVATION_NOT_FOUND",
  },
  cancelled: {
    title: "Cannot Modify",
    detail: "Cannot modify a cancelled reservation",
    code: "RESERVATION_ALREADY_CANCELLED",
  },
  completed: {
    title: "Cannot Modify",
    detail: "Cannot modify a completed reservation",
    code: "RESERVATION_ALREADY_COMPLETED",
  },
} as const;

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
        const { title, detail, code } = NOT_OK_MESSAGES[preamble.reason];
        return reply
          .status(preamble.status)
          .send(
            createProblemDetails(preamble.status, title, detail, "about:blank", undefined, { code })
          );
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

      const updated = result.reservation;
      return reply.status(200).send({
        data: {
          reservation: {
            id: updated.id,
            date: updated.date,
            startTime: updated.startTime,
            endTime: updated.endTime,
            partySize: updated.partySize,
            guestName: updated.guestName,
            guestEmail: updated.guestEmail,
            status: updated.status,
            notes: updated.notes,
          },
        },
      });
    }
  );
};
