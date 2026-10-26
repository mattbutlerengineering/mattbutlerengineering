/**
 * The availability config API, declared once (docs/features/venue-availability/
 * architecture.md § Reservations HTTP). The reservations service registers its
 * routes from these (`registerEndpoint`), and `AvailabilityClient` calls them
 * (`ApiClient.call`).
 */
import { z } from "zod";
import { defineEndpoint, problem } from "./define.js";
import {
  AvailabilityConfigProblemSchema,
  AvailabilityConfigSaveResultSchema,
  AvailabilityConfigStateSchema,
  AvailabilityDaySummarySchema,
  AvailabilityDaysQuerySchema,
  ClosureImpactBodySchema,
  ClosureImpactSchema,
  ClosureResultSchema,
  CreateClosureBodySchema,
  PutAvailabilityConfigBodySchema,
  ReopenClosureBodySchema,
  ReopenResultSchema,
} from "../schemas/availability-config-api.js";

/** Mounted under the venues prefix by the reservations service. */
export const AVAILABILITY_CONFIG_PREFIX = "/api/v1/venues";

const VenueParamsSchema = z.object({ id: z.string().describe("Venue ID") });

const ClosureParamsSchema = z.object({
  id: z.string().describe("Venue ID"),
  ruleId: z.string().describe("Date rule ID"),
});

const notClosureCaller = problem(
  "Caller is not a Manager, or a Host outside the emergency-close limits (whole venue, tonight, grant on)"
);

const authRequired = problem("Authentication required");
const notMember = problem("Caller is not a member of this venue");
const venueNotFound = problem("Venue not found");

export const availabilityConfigEndpoints = {
  getConfig: defineEndpoint({
    method: "GET",
    path: `${AVAILABILITY_CONFIG_PREFIX}/:id/availability/config`,
    params: VenueParamsSchema,
    responses: {
      200: {
        description: "The venue's availability configuration and its version",
        body: z.object({ data: AvailabilityConfigStateSchema }),
      },
      401: authRequired,
      403: notMember,
      404: venueNotFound,
    },
  }),
  putConfig: defineEndpoint({
    method: "PUT",
    path: `${AVAILABILITY_CONFIG_PREFIX}/:id/availability/config`,
    params: VenueParamsSchema,
    body: PutAvailabilityConfigBodySchema,
    responses: {
      200: {
        description: "Saved; the new version and the audit row's id",
        body: z.object({ data: AvailabilityConfigSaveResultSchema }),
      },
      401: authRequired,
      403: problem("Caller is not a Manager of this venue"),
      404: venueNotFound,
      409: {
        description:
          "`version-conflict` (names the winning change) or `stranded-bookings` (route through the closure path)",
        body: AvailabilityConfigProblemSchema,
      },
      422: {
        description: "`invalid-config`, with path-addressed issues",
        body: AvailabilityConfigProblemSchema,
      },
    },
  }),
  closureImpact: defineEndpoint({
    method: "POST",
    path: `${AVAILABILITY_CONFIG_PREFIX}/:id/closures/impact`,
    params: VenueParamsSchema,
    body: ClosureImpactBodySchema,
    responses: {
      200: {
        description:
          "Future bookings the draft rule would affect, grouped by date and kind (read-only)",
        body: z.object({ data: ClosureImpactSchema }),
      },
      400: problem("Date range too long to evaluate"),
      401: authRequired,
      403: notClosureCaller,
      404: venueNotFound,
      422: {
        description: "`invalid-config`: the draft rule does not validate against the config",
        body: AvailabilityConfigProblemSchema,
      },
    },
  }),
  createClosure: defineEndpoint({
    method: "POST",
    path: `${AVAILABILITY_CONFIG_PREFIX}/:id/closures`,
    params: VenueParamsSchema,
    body: CreateClosureBodySchema,
    responses: {
      200: {
        description:
          "Saved atomically with its cancels and moves (or replayed from the same `Idempotency-Key`): the rule, the version and outcome counts",
        body: z.object({ data: ClosureResultSchema }),
      },
      400: problem("Missing `Idempotency-Key` header, or a date range too long to evaluate"),
      401: authRequired,
      403: notClosureCaller,
      404: venueNotFound,
      409: {
        description:
          "`version-conflict`, `idempotency-key-reused` (a different rule) or `closure-exists` (this rule id was already saved)",
        body: AvailabilityConfigProblemSchema,
      },
      422: {
        description:
          "`invalid-config`, `decision-required`, `invalid-decision` or `move-unavailable`",
        body: AvailabilityConfigProblemSchema,
      },
    },
  }),
  reopenClosure: defineEndpoint({
    method: "DELETE",
    path: `${AVAILABILITY_CONFIG_PREFIX}/:id/closures/:ruleId`,
    params: ClosureParamsSchema,
    body: ReopenClosureBodySchema,
    responses: {
      200: {
        description: "Reopened; guests the closure cancelled stay cancelled",
        body: z.object({ data: ReopenResultSchema }),
      },
      401: authRequired,
      403: notClosureCaller,
      404: problem("Venue or closure not found"),
    },
  }),
  listDays: defineEndpoint({
    method: "GET",
    path: `${AVAILABILITY_CONFIG_PREFIX}/:id/availability/days`,
    params: VenueParamsSchema,
    query: AvailabilityDaysQuerySchema,
    responses: {
      200: {
        description: "One summary per service date in the range, for the calendar",
        body: z.object({ data: z.array(AvailabilityDaySummarySchema) }),
      },
      400: problem("Invalid or too long date range"),
      401: authRequired,
      403: notMember,
      404: venueNotFound,
    },
  }),
};
