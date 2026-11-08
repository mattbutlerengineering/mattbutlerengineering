import type { FastifyPluginAsync } from "fastify";
import {
  HOLIDAY_DECISIONS_MAX_RANGE,
  createProblemDetails,
  holidayDecisionEndpoints,
  isHolidayDecisionsRange,
  isRealServiceDate,
} from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { registerEndpoint } from "@mbe/service-bootstrap";
import { venueScoped } from "./venue-scope.js";

/**
 * Holiday decisions (docs/features/availability-holidays-copy/architecture.md § A2): a Manager's
 * answer for one holiday that does not change the hours. Humble adapters over the store.
 * Reads need venue membership (a Host sees decided holidays); writes need a Manager.
 */

const VENUE_FROM_ID = { venue: { from: "params", field: "id" } } as const;
const VENUE_NOT_FOUND = "Venue not found";
const BAD_DATE = "`serviceDate` must be a real date, YYYY-MM-DD.";
const BAD_RANGE = `\`to\` must be on or after \`from\`, at most ${HOLIDAY_DECISIONS_MAX_RANGE} days in all, both real dates.`;

export const holidayDecisionRoutes: FastifyPluginAsync = async (fastify) => {
  const { holidayDecisionService } = fastify.services;

  registerEndpoint(fastify, holidayDecisionEndpoints.list, {
    docs: {
      summary: "List a venue's holiday decisions",
      operationId: "listHolidayDecisions",
      description:
        "The holidays a Manager answered without changing the hours (today: open as usual), from `from` to `to` inclusive, by date. At most 400 days. Any venue member may read.",
      tags: ["Availability"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(VENUE_FROM_ID, async (request, reply, { venueId }) => {
      if (!isHolidayDecisionsRange(request.query)) {
        return reply.code(400).send(createProblemDetails(400, "Bad Request", BAD_RANGE));
      }
      const decisions = await holidayDecisionService.list(venueId, request.query, request.log);
      if (!decisions) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", VENUE_NOT_FOUND));
      }
      return { data: decisions };
    }),
  });

  registerEndpoint(fastify, holidayDecisionEndpoints.set, {
    docs: {
      summary: "Record a holiday decision",
      operationId: "setHolidayDecision",
      description:
        "Idempotent: a repeat returns the existing row unchanged. Not an availability change: it writes no history and does not bump the availability version. The date is not checked against any holiday calendar. Requires a Manager (owner or manager) membership, or the admin role.",
      tags: ["Availability"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(
      { ...VENUE_FROM_ID, access: "manager" },
      async (request, reply, { venueId }) => {
        if (!isRealServiceDate(request.params.serviceDate)) {
          return reply.code(400).send(createProblemDetails(400, "Bad Request", BAD_DATE));
        }
        const decision = await holidayDecisionService.set({
          venueId,
          serviceDate: request.params.serviceDate,
          decision: request.body.decision,
          actorId: request.user?.id ?? "unknown",
        });
        if (!decision) {
          return reply.code(404).send(createProblemDetails(404, "Not Found", VENUE_NOT_FOUND));
        }
        return { data: decision };
      }
    ),
  });

  registerEndpoint(fastify, holidayDecisionEndpoints.clear, {
    docs: {
      summary: "Clear a holiday decision",
      operationId: "clearHolidayDecision",
      description:
        "Idempotent: a date with no decision still answers 204. Requires a Manager (owner or manager) membership, or the admin role.",
      tags: ["Availability"],
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
    handler: venueScoped(
      { ...VENUE_FROM_ID, access: "manager" },
      async (request, reply, { venueId }) => {
        if (!isRealServiceDate(request.params.serviceDate)) {
          return reply.code(400).send(createProblemDetails(400, "Bad Request", BAD_DATE));
        }
        const found = await holidayDecisionService.clear(venueId, request.params.serviceDate);
        if (!found) {
          return reply.code(404).send(createProblemDetails(404, "Not Found", VENUE_NOT_FOUND));
        }
        return reply.code(204).send();
      }
    ),
  });
};
