import type { FastifyPluginAsync } from "fastify";
import type { ProblemDetails } from "@mbe/types";
import { createProblemDetails } from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { venueScoped } from "./venue-scope.js";
import {
  DEFAULT_EVENT_PAGE_SIZE,
  InvalidEventCursorError,
  MAX_EVENT_PAGE_SIZE,
  listForReservation,
  type ReservationEventDto,
} from "../services/reservation-events.js";

export const reservationEventRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: { id: string };
    Querystring: { limit?: number; cursor?: string };
    Reply: { data: ReservationEventDto[]; nextCursor: string | null } | ProblemDetails;
  }>(
    "/:id/events",
    {
      preHandler: requireAuth,
      schema: {
        summary: "List a reservation's event history",
        operationId: "listReservationEvents",
        description:
          "Staff-only, oldest-first history of what happened to a reservation. Event " +
          "states are non-PII scheduling snapshots. Paginate by passing the returned " +
          "`nextCursor` back as `cursor`.",
        tags: ["Reservations"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        querystring: {
          type: "object",
          properties: {
            limit: {
              type: "integer",
              minimum: 1,
              maximum: MAX_EVENT_PAGE_SIZE,
              default: DEFAULT_EVENT_PAGE_SIZE,
            },
            cursor: { type: "string", minLength: 1 },
          },
        },
        response: {
          200: {
            description: "A page of reservation events",
            type: "object",
            properties: {
              data: { type: "array", items: { type: "object", additionalProperties: true } },
              nextCursor: { type: ["string", "null"] },
            },
          },
          400: { description: "Invalid limit or cursor", $ref: "Error#" },
          401: { description: "Authentication required", $ref: "Error#" },
          403: { description: "No access to the reservation's venue", $ref: "Error#" },
          404: { description: "Reservation not found", $ref: "Error#" },
        },
      },
    },
    // Venue members only (not the guest owner: the log carries staff actor ids).
    // An unknown id and another venue's id are indistinguishable to a non-admin.
    venueScoped(
      {
        venue: {
          entity: "reservation",
          key: (request) => request.params.id,
          notFound: "Reservation not found",
        },
      },
      async (request, reply) => {
        try {
          return await listForReservation(request.params.id, {
            limit: request.query.limit ?? DEFAULT_EVENT_PAGE_SIZE,
            cursor: request.query.cursor,
          });
        } catch (err) {
          if (err instanceof InvalidEventCursorError) {
            return reply.code(400).send(createProblemDetails(400, "Bad Request", err.message));
          }
          throw err;
        }
      }
    )
  );
};
