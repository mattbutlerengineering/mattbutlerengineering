import type { FastifyPluginAsync } from "fastify";
import type { ProblemDetails } from "@mbe/types";
import { createProblemDetails } from "@mbe/types";
import { requireAuth, requireVenueAccess } from "@mbe/auth/fastify";
import { validateDateString } from "@mbe/database";
import { venueIdFromQuery } from "./venue-access.js";
import { bookingMetricsService, type DailyBookingMetrics } from "../services/booking-metrics.js";

/** Today's date as YYYY-MM-DD (UTC), the default window when no `date` is given. */
function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export const bookingMetricsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { date?: string; venueId?: string };
    Reply: { data: DailyBookingMetrics } | ProblemDetails;
  }>(
    "/daily",
    {
      preHandler: [
        requireAuth,
        requireVenueAccess(fastify.venueMembershipLookup, venueIdFromQuery),
      ],
      schema: {
        summary: "Get daily booking-funnel counts",
        operationId: "getDailyBookingMetrics",
        description:
          "Internal aggregation route for booking-funnel telemetry. Returns counts-only " +
          "reservation and deposit aggregates for a given day and venue — never a " +
          "reservation id, guest name, email, or phone number.",
        tags: ["Metrics"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD, defaults to today" },
            venueId: { type: "string" },
          },
        },
        response: {
          200: {
            description: "Daily booking-funnel counts",
            type: "object",
            properties: {
              data: { type: "object", additionalProperties: true },
            },
          },
          400: { description: "Missing or invalid query parameters", $ref: "Error#" },
          401: { description: "Authentication required", $ref: "Error#" },
          403: { description: "No access to the requested venue", $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      // Venue authorization is enforced by requireVenueAccess (ADR-020). The
      // explicit check below only guards the platform-admin path, which
      // bypasses venue resolution entirely and would otherwise reach here
      // with venueId undefined.
      const { venueId } = request.query;
      if (!venueId) {
        return reply
          .code(400)
          .send(createProblemDetails(400, "Bad Request", "venueId query parameter is required"));
      }

      const date = request.query.date ?? todayDateString();
      const dateResult = validateDateString(date);
      if (!dateResult.valid) {
        return reply.code(400).send(createProblemDetails(400, "Bad Request", dateResult.error));
      }

      const data = await bookingMetricsService.getDailyBookingMetrics({ date, venueId });
      return { data };
    }
  );
};
