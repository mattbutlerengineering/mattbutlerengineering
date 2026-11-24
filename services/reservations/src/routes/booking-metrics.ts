import type { FastifyPluginAsync } from "fastify";
import type { ProblemDetails } from "@mbe/types";
import { createProblemDetails, endOfServiceEndpoints } from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { registerEndpoint } from "@mbe/service-bootstrap";
import { validateDateString } from "@mbe/database";
import { venueScoped } from "./venue-scope.js";
import { bookingMetricsService, type DailyBookingMetrics } from "../services/booking-metrics.js";
import { endOfServiceSummaryService } from "../services/end-of-service-summary.js";

/** Today's date as YYYY-MM-DD (UTC), the default window when no `date` is given. */
function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export const bookingMetricsRoutes: FastifyPluginAsync = async (fastify) => {
  // End-of-service summary (#9482): counts only, for the venue's own service date.
  registerEndpoint(fastify, endOfServiceEndpoints.get, {
    docs: {
      summary: "Get the end-of-service summary",
      operationId: "getEndOfServiceSummary",
      description:
        "Counts-only summary for one service date at a venue: covers (party sizes of completed " +
        "reservations), table turns (completed seatings) and no-shows. `turnedAway` is null until " +
        "the Lost Demand Ledger fills it. The date is the venue's service day and defaults to " +
        "today in the venue's own time zone. Never returns a reservation id or any guest detail. " +
        "Requires venue membership.",
      tags: ["Metrics"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(
      {
        venue: {
          from: "query",
          field: "venueId",
          missing: "venueId query parameter is required",
        },
      },
      async (request, reply, { venueId }) => {
        const date =
          request.query.date ?? (await endOfServiceSummaryService.defaultServiceDate(venueId));
        const dateResult = validateDateString(date);
        if (!dateResult.valid) {
          return reply.code(400).send(createProblemDetails(400, "Bad Request", dateResult.error));
        }
        return { data: await endOfServiceSummaryService.getSummary({ venueId, date }) };
      }
    ),
  });

  fastify.get<{
    Querystring: { date?: string; venueId?: string };
    Reply: { data: DailyBookingMetrics } | ProblemDetails;
  }>(
    "/daily",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Get daily booking-funnel counts",
        operationId: "getDailyBookingMetrics",
        description:
          "Internal aggregation route for booking-funnel telemetry. Returns counts-only " +
          "reservation, deposit and reservation-event aggregates for a given day and venue — never a " +
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
    // Venue authorization (ADR-020) and RLS context (ADR-026) come from
    // venueScoped. A platform admin who omits venueId gets this route's own
    // 400 detail; a non-admin gets 403.
    venueScoped(
      {
        venue: {
          from: "query",
          field: "venueId",
          missing: "venueId query parameter is required",
        },
      },
      async (request, reply, { venueId }) => {
        const date = request.query.date ?? todayDateString();
        const dateResult = validateDateString(date);
        if (!dateResult.valid) {
          return reply.code(400).send(createProblemDetails(400, "Bad Request", dateResult.error));
        }

        const data = await bookingMetricsService.getDailyBookingMetrics({ date, venueId });
        return { data };
      }
    )
  );
};
