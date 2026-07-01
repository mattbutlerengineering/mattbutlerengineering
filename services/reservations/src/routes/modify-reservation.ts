import type { FastifyPluginAsync } from "fastify";
import { reservationService } from "../services/reservation.js";
import { venueService } from "../services/venue.js";
import { requireManageToken } from "../middleware/require-manage-token.js";
import { loadReservationForManage } from "./load-reservation-for-manage.js";

interface ModifyBody {
  date?: string;
  startTime?: string;
  endTime?: string;
  partySize?: number;
  specialRequests?: string;
}

const NOT_OK_MESSAGES = {
  not_found: { title: "Reservation Not Found", detail: "Reservation not found" },
  cancelled: { title: "Cannot Modify", detail: "Cannot modify a cancelled reservation" },
  completed: { title: "Cannot Modify", detail: "Cannot modify a completed reservation" },
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
        const { title, detail } = NOT_OK_MESSAGES[preamble.reason];
        return reply.status(preamble.status).send({
          type: "about:blank",
          title,
          status: preamble.status,
          detail,
        });
      }
      const reservation = preamble.reservation;

      const body = request.body ?? {};
      const { date, startTime, endTime, partySize, specialRequests } = body;

      const hasChanges =
        date !== undefined ||
        startTime !== undefined ||
        endTime !== undefined ||
        partySize !== undefined ||
        specialRequests !== undefined;

      if (!hasChanges) {
        return reply.status(400).send({
          type: "about:blank",
          title: "No Changes",
          status: 400,
          detail: "At least one field must be provided to modify",
        });
      }

      const updateData = {
        ...(date !== undefined && { date }),
        ...(startTime !== undefined && { startTime }),
        ...(endTime !== undefined && { endTime }),
        ...(partySize !== undefined && { partySize }),
        ...(specialRequests !== undefined && { notes: specialRequests }),
      };

      const updateResult = await reservationService.updateWithConflictCheck(
        reservation.id,
        updateData
      );

      if (!updateResult.success) {
        if (updateResult.conflict) {
          return reply.status(409).send({
            type: "about:blank",
            title: "Slot Unavailable",
            status: 409,
            detail: updateResult.error,
          });
        }
        return reply.status(500).send({
          type: "about:blank",
          title: "Update Failed",
          status: 500,
          detail: updateResult.error ?? "Failed to modify reservation",
        });
      }

      const updated = updateResult.reservation!;
      const venue = updated.venueId ? await venueService.getById(updated.venueId) : null;

      // Reschedule reminder jobs if time changed
      const timeChanged = date !== undefined || startTime !== undefined || endTime !== undefined;
      if (timeChanged) {
        fastify.bookingNotifier
          .rescheduleBookingReminders(updated, request.query.token!)
          .catch((err) => fastify.log.error({ err }, "Failed to reschedule booking reminders"));
      }

      if (updated.guestEmail && venue) {
        const preference =
          (updated.guest?.communicationPreference as
            "email_only" | "sms_only" | "both" | "transactional_only" | null) ?? "email_only";
        try {
          await fastify.notificationPort.sendBookingModified(
            {
              reservationId: updated.id,
              date: updated.date,
              startTime: updated.startTime,
              endTime: updated.endTime,
              partySize: updated.partySize,
              guestName: updated.guestName,
              guestEmail: updated.guestEmail,
              guestPhone: updated.guestPhone ?? null,
              specialRequests: updated.notes ?? null,
              venueName: venue.name,
              venueTimezone: venue.ianaTimezone,
              venueAddress: null,
              manageToken: request.query.token!,
              sequence: 2,
            },
            preference
          );
        } catch {
          request.log.error("Failed to send booking modified notification");
        }
      }

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
