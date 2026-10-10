import type { FastifyPluginAsync } from "fastify";
import type { ProblemDetails } from "@mbe/types";
import { createProblemDetails, briefingQueryJsonSchema } from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { venueScoped } from "./venue-scope.js";
import { briefingService, type BriefingEntry } from "../services/briefing.js";

export const briefingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { date?: string; venueId?: string };
    Reply: { data: BriefingEntry[] } | ProblemDetails;
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
        querystring: briefingQueryJsonSchema,
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
    // Venue authorization (ADR-020) and RLS context (ADR-026) come from
    // venueScoped: by the time the handler runs the caller is a platform admin
    // or a member of `venueId`. The schema requires both params, so the admin
    // 400 below is reached only by an empty `venueId`.
    venueScoped(
      {
        venue: {
          from: "query",
          field: "venueId",
          missing: "venueId query parameter is required",
        },
      },
      async (request, reply, { venueId }) => {
        const { date } = request.query;

        if (!date) {
          return reply
            .code(400)
            .send(createProblemDetails(400, "Bad Request", "date query parameter is required"));
        }

        const data = await briefingService.getBriefing({ date, venueId });
        return { data };
      }
    )
  );
};
