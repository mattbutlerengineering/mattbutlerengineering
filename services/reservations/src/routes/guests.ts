import type { FastifyPluginAsync } from "fastify";
import {
  createProblemDetails,
  GUEST_CONTACT_REQUIRED_MESSAGE,
  guestsEndpoints,
  hasGuestContact,
} from "@mbe/types";
import { parsePaginationQuery } from "@mbe/database";
import { requireAuth } from "@mbe/auth/fastify";
import { registerEndpoint } from "@mbe/service-bootstrap";
import {
  cooldownDetail,
  defaultWinBackDeps,
  sendWinBack,
  type WinBackResult,
} from "../services/win-back.js";
import { winBackStatusFor } from "../services/win-back-store.js";
import { venueScoped } from "./venue-scope.js";

/**
 * 404 `detail` for a guest addressed by `:id`. `venueScoped` resolves the
 * guest's venue once (a non-member, or anyone probing an unknown id without
 * admin, gets 403, never leaking existence) and runs the handler inside that
 * venue's RLS context.
 */
const GUEST_NOT_FOUND = "Guest not found";

/**
 * The refusal a win-back that did not go out answers with, or `null` when it was sent or
 * skipped. 409: a repeat inside the cooldown. 424: the send was refused or impossible, the claim
 * is released and nothing went out, so the caller may try again.
 */
function winBackProblem(
  result: WinBackResult,
  guestName: string,
  timeZone: string
): { status: 409 | 424; title: string; detail: string } | null {
  switch (result.status) {
    case "cooldown":
      return {
        status: 409,
        title: "Conflict",
        detail: cooldownDetail(guestName, result, timeZone),
      };
    case "failed":
      return {
        status: 424,
        title: "Failed Dependency",
        detail: `The email provider rejected the win-back message to ${guestName}. Nothing was sent. You can try again.`,
      };
    case "unavailable":
      return {
        status: 424,
        title: "Failed Dependency",
        detail: `Email sending isn't set up here, so the win-back message to ${guestName} was not sent. Nothing was sent.`,
      };
    default:
      return null;
  }
}

export const guestRoutes: FastifyPluginAsync = async (fastify) => {
  const { guestService, venueService } = fastify.services;

  // List guests for a venue
  registerEndpoint(fastify, guestsEndpoints.list, {
    docs: {
      summary: "List guests for a venue",
      operationId: "listGuests",
      description:
        "Retrieve a paginated list of guests for a specific venue. Requires authentication.",
      tags: ["Guests"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped({ venue: "query" }, async (request, _reply, { venueId }) => {
      const { page, limit } = parsePaginationQuery(request.query);
      return guestService.list(venueId, page, limit);
    }),
  });

  // Search guests
  registerEndpoint(fastify, guestsEndpoints.search, {
    docs: {
      summary: "Search guests",
      operationId: "searchGuests",
      description: "Search guests by name, email, phone, or filter by tags and visit history.",
      tags: ["Guests"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped({ venue: "query" }, async (request, _reply, { venueId }) => {
      const { query, tags, hasNotVisitedInDays } = request.query;
      return guestService.search({
        venueId,
        query,
        tags: tags ? tags.split(",") : undefined,
        hasNotVisitedInDays: hasNotVisitedInDays ? parseInt(hasNotVisitedInDays, 10) : undefined,
      });
    }),
  });

  // Get guest segments
  registerEndpoint(fastify, guestsEndpoints.getSegments, {
    docs: {
      summary: "Get guest segments",
      operationId: "getGuestSegments",
      description: "Get guest segments (VIP, At Risk, Lapsed, etc.) for a venue.",
      tags: ["Guests"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped({ venue: "query" }, async (_request, _reply, { venueId }) => {
      const segments = await guestService.getSegments(venueId);
      return { data: segments };
    }),
  });

  // Get guest by ID
  registerEndpoint(fastify, guestsEndpoints.get, {
    docs: {
      summary: "Get guest by ID",
      operationId: "getGuestById",
      description: "Retrieve a single guest by ID.",
      tags: ["Guests"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(
      {
        venue: {
          entity: "guest",
          key: (request) => request.params.id,
          load: (id) => guestService.getById(id),
          notFound: GUEST_NOT_FOUND,
        },
      },
      async (_request, _reply, { entity }) => ({ data: entity })
    ),
  });

  // Create guest
  registerEndpoint(fastify, guestsEndpoints.create, {
    docs: {
      summary: "Create a new guest",
      operationId: "createGuest",
      description: "Create a new guest. Requires authentication.",
      tags: ["Guests"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped({ venue: "body" }, async (request, reply) => {
      try {
        const guest = await guestService.create(request.body);
        return reply.code(201).send({ data: guest });
      } catch (error) {
        if (error instanceof Error && error.message.includes("Unique constraint")) {
          return reply
            .code(400)
            .send(
              createProblemDetails(
                400,
                "Bad Request",
                "A guest with this email or phone already exists at this venue"
              )
            );
        }
        throw error;
      }
    }),
  });

  // Find or create guest (identity resolution)
  registerEndpoint(fastify, guestsEndpoints.findOrCreate, {
    docs: {
      summary: "Find or create guest",
      operationId: "findOrCreateGuest",
      description:
        "Find existing guest by email/phone or create new one. Used for identity resolution when booking.",
      tags: ["Guests"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped({ venue: "body" }, async (request, reply, { venueId }) => {
      const { email, phone, name, notes, dietaryRestrictions } = request.body;
      if (!hasGuestContact({ email, phone })) {
        return reply
          .code(400)
          .send(createProblemDetails(400, "Bad Request", GUEST_CONTACT_REQUIRED_MESSAGE));
      }
      const guest = await guestService.findOrCreate(venueId, {
        email,
        phone,
        name,
        notes,
        dietaryRestrictions,
      });
      return { data: guest };
    }),
  });

  // Update guest
  registerEndpoint(fastify, guestsEndpoints.update, {
    docs: {
      summary: "Update a guest",
      operationId: "updateGuest",
      description: "Update guest information. Requires authentication.",
      tags: ["Guests"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(
      {
        venue: { entity: "guest", key: (request) => request.params.id, notFound: GUEST_NOT_FOUND },
      },
      async (request, reply) => {
        const guest = await guestService.update(request.params.id, request.body);
        if (!guest) {
          return reply.code(404).send(createProblemDetails(404, "Not Found", GUEST_NOT_FOUND));
        }
        return { data: guest };
      }
    ),
  });

  // Add staff note to guest
  registerEndpoint(fastify, guestsEndpoints.addNote, {
    docs: {
      summary: "Add a staff note to a guest",
      operationId: "addGuestNote",
      description:
        "Append a staff note to a guest profile. Notes include the authenticated user's identity and a timestamp. Staff notes are only visible on authenticated endpoints.",
      tags: ["Guests"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(
      {
        venue: { entity: "guest", key: (request) => request.params.id, notFound: GUEST_NOT_FOUND },
      },
      async (request, reply) => {
        const { text } = request.body;
        if (!text || text.trim().length === 0) {
          return reply.code(400).send(createProblemDetails(400, "Bad Request", "text is required"));
        }
        const createdBy = request.user?.id ?? "unknown";
        const guest = await guestService.addNote(request.params.id, text, createdBy);
        if (!guest) {
          return reply.code(404).send(createProblemDetails(404, "Not Found", GUEST_NOT_FOUND));
        }
        return reply.code(201).send({ data: guest });
      }
    ),
  });

  // Get lapsing guests for a venue (on-demand scan)
  registerEndpoint(fastify, guestsEndpoints.getLapsing, {
    docs: {
      summary: "Get lapsing guests",
      operationId: "getLapsingGuests",
      description:
        "Run lapse detection and return guests who haven't visited in > 2x their average frequency.",
      tags: ["Guests"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped({ venue: "query" }, async (_request, _reply, { venueId }) => {
      const lapsing = await guestService.scanLapsedGuests(venueId, (vid, guests) =>
        fastify.reservationEvents.emitLapsingGuests(vid, guests)
      );
      const status = await winBackStatusFor(
        venueId,
        lapsing.map((g) => g.guestId)
      );
      return {
        data: lapsing.map((g) => ({
          ...g,
          // Only a send the provider accepted; an unconfirmed claim is reported apart.
          lastWinBackAt: status.get(g.guestId)?.sentAt?.toISOString() ?? null,
          winBackAttemptedAt: status.get(g.guestId)?.attemptedAt?.toISOString() ?? null,
        })),
      };
    }),
  });

  // Send win-back message to a guest
  registerEndpoint(fastify, guestsEndpoints.sendWinBack, {
    docs: {
      summary: "Send win-back message",
      operationId: "sendGuestWinBack",
      description:
        "Send a personalized win-back message to a lapsing guest. Skipped if communicationPreference is transactional_only.",
      tags: ["Guests"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(
      {
        venue: {
          entity: "guest",
          key: (request) => request.params.id,
          load: async (id) => {
            const guest = await guestService.getById(id);
            if (!guest) return null;
            const venue = await venueService.getById(guest.venueId);
            return {
              guest,
              venueName: venue?.name ?? guest.venueId,
              timeZone: venue?.ianaTimezone ?? "UTC",
            };
          },
          notFound: GUEST_NOT_FOUND,
        },
      },
      async (request, reply, { entity }) => {
        const result = await sendWinBack(entity.guest, fastify.notificationPort, entity.venueName, {
          ...defaultWinBackDeps,
          log: request.log,
        });
        const problem = winBackProblem(result, entity.guest.name, entity.timeZone);
        if (problem) {
          return reply
            .code(problem.status)
            .send(createProblemDetails(problem.status, problem.title, problem.detail));
        }
        return { data: { sent: result.status === "sent" } };
      }
    ),
  });

  // Delete guest
  registerEndpoint(fastify, guestsEndpoints.delete, {
    docs: {
      summary: "Delete a guest",
      operationId: "deleteGuest",
      description: "Delete a guest. Will fail if guest has reservations.",
      tags: ["Guests"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(
      {
        venue: { entity: "guest", key: (request) => request.params.id, notFound: GUEST_NOT_FOUND },
      },
      async (request, reply) => {
        const deleted = await guestService.delete(request.params.id);
        if (!deleted) {
          return reply.code(404).send(createProblemDetails(404, "Not Found", GUEST_NOT_FOUND));
        }
        return reply.code(204).send();
      }
    ),
  });
};
