import type { FastifyPluginAsync } from "fastify";
import type { ProblemDetails } from "@mbe/types";
import {
  autopilotProposalsEndpoints,
  createProblemDetails,
  endOfServiceEndpoints,
  lostDemandEndpoints,
} from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { registerEndpoint } from "@mbe/service-bootstrap";
import { validateDateString } from "@mbe/database";
import { venueScoped } from "./venue-scope.js";
import { bookingMetricsService, type DailyBookingMetrics } from "../services/booking-metrics.js";
import { autopilotProposalsService } from "../services/autopilot-proposals.js";
import { endOfServiceSummaryService } from "../services/end-of-service-summary.js";
import {
  MAX_WINDOW_DAYS,
  defaultWindowStart,
  lostDemandReportService,
  windowDays,
} from "../services/lost-demand-report.js";

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

  // Autopilot proposals (#9492): read-only suggestions for tonight; nothing here applies a move.
  registerEndpoint(fastify, autopilotProposalsEndpoints.get, {
    docs: {
      summary: "Get tonight's Autopilot proposals",
      operationId: "getAutopilotProposals",
      description:
        "Up to three moves the rule-based engine suggests for the venue's current service date: " +
        "reseating a booked party or offering a table to a waiting party, each with a plain " +
        "reason. Suggestions only; nothing is applied. Requires venue membership.",
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
      async (_request, _reply, { venueId }) => {
        const date = await endOfServiceSummaryService.defaultServiceDate(venueId);
        return { data: await autopilotProposalsService.getProposals({ venueId, date }) };
      }
    ),
  });

  // Turned-away demand by weekday and hour (#9485): counts only, from the Lost Demand Ledger.
  registerEndpoint(fastify, lostDemandEndpoints.get, {
    docs: {
      summary: "Get turned-away demand by weekday and hour",
      operationId: "getLostDemand",
      description:
        "Counts of public availability searches that found no slot, bucketed by the venue-local " +
        "weekday of the service date and the hour of the requested time. Searches that named no " +
        "time are returned separately as `anyTime`, by weekday, and are never placed in an hour. " +
        "The window defaults to the last 28 days ending today in the venue's own time zone and may " +
        `span at most ${MAX_WINDOW_DAYS} days. Counts only: no guest, session or IP. ` +
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
        const to = request.query.to ?? (await lostDemandReportService.defaultWindow(venueId)).to;
        const from = request.query.from ?? defaultWindowStart(to);
        const invalid = [validateDateString(from), validateDateString(to)].find((r) => !r.valid);
        if (invalid && !invalid.valid) {
          return reply.code(400).send(createProblemDetails(400, "Bad Request", invalid.error));
        }
        const days = windowDays(from, to);
        if (days < 1 || days > MAX_WINDOW_DAYS) {
          return reply
            .code(400)
            .send(
              createProblemDetails(
                400,
                "Bad Request",
                `from must not be after to, and the window may span at most ${MAX_WINDOW_DAYS} days`
              )
            );
        }
        return { data: await lostDemandReportService.getLostDemand({ venueId, from, to }) };
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
