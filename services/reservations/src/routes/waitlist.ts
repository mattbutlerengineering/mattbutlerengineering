import type { FastifyPluginAsync } from "fastify";
import { createProblemDetails } from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { TwilioSmsAdapter } from "@mbe/notifications";
import type { SmsPort } from "@mbe/notifications";
import { waitlistService } from "../services/waitlist.js";
import {
  buildAddedSms,
  buildTableReadySms,
  estimateWaitMinutes,
  sendWaitlistSms,
  scheduleClaimWindow,
} from "../services/waitlist-sms.js";

// Build SMS adapter once at module load; null when credentials absent (dev/test).
const smsAdapter: SmsPort | null =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER
    ? new TwilioSmsAdapter({
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        fromNumber: process.env.TWILIO_FROM_NUMBER,
      })
    : null;

export const waitlistRoutes: FastifyPluginAsync = async (fastify) => {
  // List waitlist entries for a venue (requires auth)
  fastify.get<{
    Querystring: { venueId?: string };
  }>(
    "/",
    {
      preHandler: requireAuth,
      schema: {
        summary: "List waitlist entries",
        operationId: "listWaitlist",
        tags: ["Waitlist"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            venueId: { type: "string" },
          },
          required: ["venueId"],
        },
      },
    },
    async (request, reply) => {
      const { venueId } = request.query;
      if (!venueId) {
        return reply
          .code(400)
          .send(createProblemDetails(400, "Bad Request", "venueId is required"));
      }
      const entries = await waitlistService.listWaiting(venueId);
      return { data: entries };
    }
  );

  // Add to waitlist (requires auth)
  fastify.post<{
    Body: {
      venueId: string;
      guestName: string;
      guestPhone: string;
      partySize: number;
    };
  }>(
    "/",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Add guest to waitlist",
        operationId: "addToWaitlist",
        tags: ["Waitlist"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            venueId: { type: "string" },
            guestName: { type: "string" },
            guestPhone: { type: "string" },
            partySize: { type: "integer", minimum: 1 },
          },
          required: ["venueId", "guestName", "guestPhone", "partySize"],
        },
      },
    },
    async (request, reply) => {
      const { venueId, guestName, guestPhone, partySize } = request.body;

      const entry = await waitlistService.add({ venueId, guestName, guestPhone, partySize });

      // SMS notification — non-blocking, no-ops when adapter absent
      const waitMinutes = estimateWaitMinutes(entry.position);
      const smsBody = buildAddedSms(entry.position, waitMinutes);
      await sendWaitlistSms(
        smsAdapter ?? { sendSms: async () => {} },
        guestPhone,
        smsBody,
        fastify.log
      );

      return reply.code(201).send({ data: entry });
    }
  );

  // Notify guest that table is ready (requires auth)
  fastify.put<{
    Params: { id: string };
  }>(
    "/:id/notify",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Notify guest their table is ready",
        operationId: "notifyWaitlistGuest",
        tags: ["Waitlist"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const entry = await waitlistService.getById(id);
      if (!entry) {
        return reply
          .code(404)
          .send(createProblemDetails(404, "Not Found", "Waitlist entry not found"));
      }

      const updated = await waitlistService.updateStatus(id, "NOTIFIED");
      if (!updated) {
        return reply
          .code(500)
          .send(createProblemDetails(500, "Internal Server Error", "Failed to update entry"));
      }

      // Send table-ready SMS and schedule 5-min claim window
      const body = buildTableReadySms();
      await sendWaitlistSms(
        smsAdapter ?? { sendSms: async () => {} },
        entry.guestPhone,
        body,
        fastify.log
      );
      scheduleClaimWindow(id, smsAdapter, fastify.log);

      return { data: updated };
    }
  );

  // Remove from waitlist (requires auth)
  fastify.delete<{
    Params: { id: string };
  }>(
    "/:id",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Remove guest from waitlist",
        operationId: "removeFromWaitlist",
        tags: ["Waitlist"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    async (request, reply) => {
      const removed = await waitlistService.remove(request.params.id);
      if (!removed) {
        return reply
          .code(404)
          .send(createProblemDetails(404, "Not Found", "Waitlist entry not found"));
      }
      return reply.code(204).send();
    }
  );
};
