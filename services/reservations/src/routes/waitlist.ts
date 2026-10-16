import type { FastifyPluginAsync } from "fastify";
import {
  createProblemDetails,
  createWaitlistBodyJsonSchema,
  listWaitlistQueryJsonSchema,
} from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import type { OnPositionsImproved } from "../services/waitlist.js";
import { validatePhone } from "../services/waitlist-notifier.js";
import { venueScoped } from "./venue-scope.js";

/** 404 `detail` for a waitlist entry addressed by `:id`. */
const ENTRY_NOT_FOUND = "Waitlist entry not found";

/**
 * The venue owning the waitlist entry addressed by `:id`: by-id actions are
 * scoped to it, and an unknown id is a 403 for non-admins (never leaking
 * existence) and a 404 for admins.
 */
const entryVenue = {
  entity: "waitlist_entry",
  key: (request: { params: { id: string } }) => request.params.id,
  notFound: ENTRY_NOT_FOUND,
} as const;

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
    estimatedWaitMinutes: { type: ["integer", "null"] },
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
  const { waitlistService } = fastify.services;

  // Fire-and-forget (same posture as notifyAdded): a failed SMS must never fail
  // the seat/cancel that triggered it, and runs after the queue is recalculated.
  const notifyImproved: OnPositionsImproved = (changes) => {
    for (const change of changes) {
      fastify.waitlistNotifier.notifyPositionUpdate(change).catch(() => {
        // Already logged inside the notifier
      });
    }
  };

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
        body: createWaitlistBodyJsonSchema,
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
    venueScoped({ venue: "body" }, async (request, reply) => {
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
    })
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
        querystring: listWaitlistQueryJsonSchema,
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
    venueScoped({ venue: "query" }, async (_request, reply, { venueId }) => {
      const entries = await waitlistService.withLiveEstimates(
        await waitlistService.listActive(venueId)
      );
      return reply.send({ data: entries });
    })
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
    venueScoped(
      { venue: { ...entryVenue, load: (id) => waitlistService.getById(id) } },
      async (_request, reply, { entity }) => {
        const [live] = await waitlistService.withLiveEstimates([entity]);
        return reply.send({ data: live ?? entity });
      }
    )
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
    venueScoped(
      { venue: { ...entryVenue, load: (id) => waitlistService.getById(id) } },
      async (_request, reply, { entity: entry }) => {
        await fastify.waitlistNotifier.notifyTableReady({
          id: entry.id,
          guestPhone: entry.guestPhone,
          guestName: entry.guestName,
          venueId: entry.venueId,
        });

        // Re-read so the response carries the persisted notified state.
        const current = await waitlistService.getById(entry.id);
        return reply.send({ data: current ?? entry });
      }
    )
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
    venueScoped({ venue: entryVenue }, async (request, reply) => {
      const entry = await waitlistService.seat(request.params.id, notifyImproved);
      if (!entry) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", ENTRY_NOT_FOUND));
      }
      return reply.send({ data: entry });
    })
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
    venueScoped({ venue: entryVenue }, async (request, reply) => {
      const entry = await waitlistService.cancel(request.params.id, notifyImproved);
      if (!entry) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", ENTRY_NOT_FOUND));
      }
      return reply.send({ data: entry });
    })
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
    venueScoped({ venue: entryVenue }, async (request, reply) => {
      const entry = await waitlistService.expire(request.params.id);
      if (!entry) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", ENTRY_NOT_FOUND));
      }
      return reply.send({ data: entry });
    })
  );
};
