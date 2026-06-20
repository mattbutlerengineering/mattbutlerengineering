import type { FastifyPluginAsync } from "fastify";
import type { ApiError } from "@mbe/types";
import { createProblemDetails } from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { briefingService, type BriefingEntry } from "../services/briefing.js";

export const briefingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { date?: string; venueId?: string };
    Reply: { data: BriefingEntry[] } | ApiError;
  }>(
    "/",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Get tonight's service briefing",
        operationId: "getServiceBriefing",
        description:
          "Returns PENDING and CONFIRMED reservations for the given date and venue, enriched with full guest CRM data.",
        tags: ["Briefing"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          required: ["date", "venueId"],
          properties: {
            date: {
              type: "string",
              format: "date",
              description: "Date for the briefing (YYYY-MM-DD)",
            },
            venueId: {
              type: "string",
              description: "Venue ID to scope the briefing to",
            },
          },
        },
        response: {
          200: {
            description: "Service briefing with enriched reservation data",
            type: "object",
            properties: {
              data: { type: "array" },
            },
          },
          400: { description: "Missing required query parameters", $ref: "Error#" },
          401: { description: "Authentication required", $ref: "Error#" },
          500: { description: "Internal server error", $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      // Venue authorization: this endpoint follows the same trust model as the existing
      // /api/v1/reservations and /api/v1/guests endpoints — any authenticated operator
      // may query any venueId. Per-venue access scoping is a separate app-wide initiative
      // and does not exist yet in the codebase (no VenueUser relation or venue-access helper).
      const { date, venueId } = request.query;

      if (!date) {
        return reply
          .code(400)
          .send(createProblemDetails(400, "Bad Request", "date query parameter is required"));
      }

      if (!venueId) {
        return reply
          .code(400)
          .send(createProblemDetails(400, "Bad Request", "venueId query parameter is required"));
      }

      const data = await briefingService.getBriefing({ date, venueId });
      return { data };
    }
  );
};
