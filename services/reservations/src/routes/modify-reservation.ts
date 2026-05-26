import type { FastifyPluginAsync } from "fastify";
import { Resend } from "resend";
import { verifyManageToken } from "./public-reservations.js";
import { reservationService } from "../services/reservation.js";
import { venueService } from "../services/venue.js";
import { ResendNotificationAdapter } from "@mbe/notifications";
import { rescheduleBookingReminders } from "../services/booking-notifications.js";

const resendClient = process.env.RESEND_API_KEY
  ? (new Resend(process.env.RESEND_API_KEY) as unknown as {
      emails: {
        send(payload: Record<string, unknown>): Promise<{ id: string }>;
      };
    })
  : null;

const notificationAdapter = new ResendNotificationAdapter({
  resend: resendClient,
  fromAddress: process.env.EMAIL_FROM ?? "reservations@mattbutlerengineering.com",
  manageBaseUrl: process.env.MANAGE_BASE_URL ?? "https://mattbutlerengineering.com",
});

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
    },
    async (request, reply) => {
      const { token } = request.query;

      if (!token) {
        return reply.status(400).send({
          type: "about:blank",
          title: "Missing Token",
          status: 400,
          detail: "Token query parameter is required",
        });
      }

      const result = verifyManageToken(token);

      if (!result.valid && result.expired) {
        return reply.status(410).send({
          type: "about:blank",
          title: "Token Expired",
          status: 410,
          detail: "This manage link has expired",
        });
      }

      if (!result.valid) {
        return reply.status(401).send({
          type: "about:blank",
          title: "Invalid Token",
          status: 401,
          detail: "Invalid or malformed token",
        });
      }

      const reservation = await reservationService.getById(result.reservationId!);
      if (!reservation) {
        return reply.status(404).send({
          type: "about:blank",
          title: "Reservation Not Found",
          status: 404,
          detail: "Reservation not found",
        });
      }

      if (reservation.status === "CANCELLED") {
        return reply.status(409).send({
          type: "about:blank",
          title: "Cannot Modify",
          status: 409,
          detail: "Cannot modify a cancelled reservation",
        });
      }

      if (reservation.status === "COMPLETED") {
        return reply.status(409).send({
          type: "about:blank",
          title: "Cannot Modify",
          status: 409,
          detail: "Cannot modify a completed reservation",
        });
      }

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
      const timeChanged =
        date !== undefined || startTime !== undefined || endTime !== undefined;
      if (timeChanged) {
        rescheduleBookingReminders(updated, token).catch(() => {});
      }

      if (updated.guestEmail && venue) {
        await notificationAdapter.sendBookingModified({
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
          manageToken: token,
          sequence: 2,
        });
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
