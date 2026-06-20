import type { FastifyPluginAsync } from "fastify";
import { createProblemDetails } from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { waitlistService } from "../services/waitlist.js";
import { validatePhone } from "../services/waitlist-notifier.js";

/** Shared schema for a WaitlistEntry response object */
const WaitlistEntrySchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    venueId: { type: "string" },
    partySize: { type: "integer" },
    guestName: { type: "string" },
    guestPhone: { type: "string" },
    position: { type: "integer" },
    estimatedWaitMinutes: { type: "integer" },
    status: {
      type: "string",
      enum: ["waiting", "notified", "seated", "expired", "cancelled"],
    },
    notifiedAt: { type: ["string", "null"] },
    expiresAt: { type: ["string", "null"] },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
};

export const waitlistRoutes: FastifyPluginAsync = async (fastify) => {
  // POST / — create waitlist entry
  fastify.post<{
    Body: {
      venueId: string;
      partySize: number;
      guestName: string;
      guestPhone: string;
      avgTurnTimeMinutes?: number;
    };
  }>(
    "/",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Add to waitlist",
        operationId: "createWaitlistEntry",
        tags: ["Waitlist"],
        body: {
          type: "object",
          required: ["venueId", "partySize", "guestName", "guestPhone"],
          properties: {
            venueId: { type: "string" },
            partySize: { type: "integer", minimum: 1 },
            guestName: { type: "string" },
            guestPhone: { type: "string" },
            avgTurnTimeMinutes: { type: "integer", minimum: 1 },
          },
        },
        response: {
          201: {
            type: "object",
            properties: { data: WaitlistEntrySchema },
          },
          400: { $ref: "Error#" },
          500: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const { guestPhone } = request.body;
      if (!validatePhone(guestPhone)) {
        return reply
          .code(400)
          .send(createProblemDetails(400, "Bad Request", "Invalid phone number"));
      }

      const entry = await waitlistService.create(request.body);

      // Fire-and-forget: SMS delivery failures must not block the response
      fastify.waitlistNotifier
        .notifyAdded({
          id: entry.id,
          guestPhone: entry.guestPhone,
          guestName: entry.guestName,
          position: entry.position,
          estimatedWaitMinutes: entry.estimatedWaitMinutes,
        })
        .catch(() => {
          // Already logged inside the notifier
        });

      return reply.code(201).send({ data: entry });
    }
  );

  // GET / — list waiting entries for venue
  fastify.get<{
    Querystring: { venueId: string };
  }>(
    "/",
    {
      preHandler: requireAuth,
      schema: {
        summary: "List waitlist entries",
        operationId: "listWaitlistEntries",
        tags: ["Waitlist"],
        querystring: {
          type: "object",
          required: ["venueId"],
          properties: {
            venueId: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              data: { type: "array", items: WaitlistEntrySchema },
            },
          },
          400: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const entries = await waitlistService.listWaiting(request.query.venueId);
      return reply.send({ data: entries });
    }
  );

  // GET /:id — get single entry
  fastify.get<{
    Params: { id: string };
  }>(
    "/:id",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Get waitlist entry",
        operationId: "getWaitlistEntry",
        tags: ["Waitlist"],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        response: {
          200: {
            type: "object",
            properties: { data: WaitlistEntrySchema },
          },
          404: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const entry = await waitlistService.getById(request.params.id);
      if (!entry) {
        return reply
          .code(404)
          .send(createProblemDetails(404, "Not Found", "Waitlist entry not found"));
      }
      return reply.send({ data: entry });
    }
  );

  // PUT /:id/notify — send "table ready" SMS and schedule 5-min claim window
  fastify.put<{
    Params: { id: string };
  }>(
    "/:id/notify",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Notify guest table is ready",
        operationId: "notifyWaitlistEntry",
        tags: ["Waitlist"],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        response: {
          200: {
            type: "object",
            properties: { data: WaitlistEntrySchema },
          },
          404: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const entry = await waitlistService.getById(request.params.id);
      if (!entry) {
        return reply
          .code(404)
          .send(createProblemDetails(404, "Not Found", "Waitlist entry not found"));
      }

      await fastify.waitlistNotifier.notifyTableReady({
        id: entry.id,
        guestPhone: entry.guestPhone,
        guestName: entry.guestName,
      });

      return reply.send({ data: entry });
    }
  );

  // PUT /:id/seat — mark seated, recalculate remaining
  fastify.put<{
    Params: { id: string };
  }>(
    "/:id/seat",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Mark guest as seated",
        operationId: "seatWaitlistEntry",
        tags: ["Waitlist"],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        response: {
          200: {
            type: "object",
            properties: { data: WaitlistEntrySchema },
          },
          404: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const entry = await waitlistService.seat(request.params.id);
      if (!entry) {
        return reply
          .code(404)
          .send(createProblemDetails(404, "Not Found", "Waitlist entry not found"));
      }
      return reply.send({ data: entry });
    }
  );

  // PUT /:id/cancel — mark cancelled, recalculate remaining
  fastify.put<{
    Params: { id: string };
  }>(
    "/:id/cancel",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Cancel waitlist entry",
        operationId: "cancelWaitlistEntry",
        tags: ["Waitlist"],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        response: {
          200: {
            type: "object",
            properties: { data: WaitlistEntrySchema },
          },
          404: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const entry = await waitlistService.cancel(request.params.id);
      if (!entry) {
        return reply
          .code(404)
          .send(createProblemDetails(404, "Not Found", "Waitlist entry not found"));
      }
      return reply.send({ data: entry });
    }
  );

  // PUT /:id/expire — mark expired
  fastify.put<{
    Params: { id: string };
  }>(
    "/:id/expire",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Mark waitlist entry as expired",
        operationId: "expireWaitlistEntry",
        tags: ["Waitlist"],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        response: {
          200: {
            type: "object",
            properties: { data: WaitlistEntrySchema },
          },
          404: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const entry = await waitlistService.expire(request.params.id);
      if (!entry) {
        return reply
          .code(404)
          .send(createProblemDetails(404, "Not Found", "Waitlist entry not found"));
      }
      return reply.send({ data: entry });
    }
  );
};
