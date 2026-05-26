import type { FastifyPluginAsync } from "fastify";
import type { ApiError } from "@mbe/types";
import { createProblemDetails } from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { briefingService } from "../services/briefing.js";
import type { BriefingResponse } from "../services/briefing.js";

export const briefingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { date?: string; venueId: string };
    Reply: BriefingResponse | ApiError;
  }>(
    "/",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Get tonight's service briefing",
        operationId: "getServiceBriefing",
        description:
          "Returns PENDING and CONFIRMED reservations enriched with full guest CRM data for a service briefing.",
        tags: ["Briefing"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          required: ["venueId"],
          properties: {
            date: {
              type: "string",
              format: "date",
              description: "Date to retrieve briefing for (YYYY-MM-DD). Defaults to today.",
            },
            venueId: {
              type: "string",
              description: "Venue ID to retrieve briefing for",
            },
          },
        },
        response: {
          200: {
            description: "Service briefing with enriched reservations",
            type: "object",
            additionalProperties: true,
            properties: {
              date: { type: "string" },
              venueId: { type: "string" },
              reservations: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
          400: { description: "Bad request", $ref: "Error#" },
          401: { description: "Authentication required", $ref: "Error#" },
          403: { description: "Access denied", $ref: "Error#" },
          404: { description: "Venue not found", $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const { venueId, date } = request.query;

      const result = await briefingService.getBriefing({ venueId, date });

      if (!result.success) {
        if (result.error === "VENUE_NOT_FOUND") {
          return reply
            .code(404)
            .send(createProblemDetails(404, "Not Found", "Venue not found"));
        }
        return reply
          .code(400)
          .send(createProblemDetails(400, "Bad Request", result.error ?? "Failed to load briefing"));
      }

      return reply.send(result.data!);
    }
  );
};
