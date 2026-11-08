/**
 * The holiday-decision API, declared once (docs/features/availability-holidays-copy/
 * architecture.md § A2). Mounted under the same venues prefix as the availability config;
 * `list` is open to any venue member, `set` and `clear` need a Manager.
 */
import { z } from "zod";
import { defineEndpoint, problem } from "./define.js";
import { AVAILABILITY_CONFIG_PREFIX } from "./availability-config.js";
import { ServiceDateSchema } from "../schemas/availability-config.js";
import {
  HolidayDecisionSchema,
  HolidayDecisionsQuerySchema,
  SetHolidayDecisionBodySchema,
} from "../schemas/holiday-decisions.js";

const VenueParamsSchema = z.object({ id: z.string().describe("Venue ID") });
const DecisionParamsSchema = VenueParamsSchema.extend({
  serviceDate: ServiceDateSchema.describe("Service date, YYYY-MM-DD"),
});

const authRequired = problem("Authentication required");
const notManager = problem("Caller is not a Manager of this venue");
const venueNotFound = problem("Venue not found");
const BASE = `${AVAILABILITY_CONFIG_PREFIX}/:id/availability/holiday-decisions`;

export const holidayDecisionEndpoints = {
  list: defineEndpoint({
    method: "GET",
    path: BASE,
    params: VenueParamsSchema,
    query: HolidayDecisionsQuerySchema,
    responses: {
      200: {
        description: "The venue's holiday decisions from `from` to `to` inclusive, by date",
        body: z.object({ data: z.array(HolidayDecisionSchema) }),
      },
      400: problem("Bad date, `to` before `from`, or a range over 400 days"),
      401: authRequired,
      403: problem("Caller is not a member of this venue"),
      404: venueNotFound,
    },
  }),
  set: defineEndpoint({
    method: "PUT",
    path: `${BASE}/:serviceDate`,
    params: DecisionParamsSchema,
    body: SetHolidayDecisionBodySchema,
    responses: {
      200: {
        description: "The decision; a repeat returns the existing row unchanged",
        body: z.object({ data: HolidayDecisionSchema }),
      },
      400: problem("Bad date or body"),
      401: authRequired,
      403: notManager,
      404: venueNotFound,
    },
  }),
  clear: defineEndpoint({
    method: "DELETE",
    path: `${BASE}/:serviceDate`,
    params: DecisionParamsSchema,
    responses: {
      204: { description: "Cleared; also when there was no decision", body: null },
      400: problem("Bad date"),
      401: authRequired,
      403: notManager,
      404: venueNotFound,
    },
  }),
};
