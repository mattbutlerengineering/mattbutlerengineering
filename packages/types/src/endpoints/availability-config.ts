/**
 * The availability config API, declared once (docs/features/venue-availability/
 * architecture.md § Reservations HTTP). The reservations service registers its
 * routes from these (`registerEndpoint`), and `AvailabilityClient` calls them
 * (`ApiClient.call`).
 */
import { z } from "zod";
import { defineEndpoint, problem } from "./define.js";
import {
  AvailabilityCheckBodySchema,
  AvailabilityCheckResultSchema,
  AvailabilityConfigProblemSchema,
  AvailabilityConfigSaveResultSchema,
  AvailabilityConfigStateSchema,
  AvailabilityDaySummarySchema,
  AvailabilityDaysQuerySchema,
  ClosureImpactBodySchema,
  ClosureImpactSchema,
  PreviewAvailabilityBodySchema,
  PreviewResultSchema,
  PutAvailabilityConfigBodySchema,
} from "../schemas/availability-config-api.js";

/** Mounted under the venues prefix by the reservations service. */
export const AVAILABILITY_CONFIG_PREFIX = "/api/v1/venues";

const VenueParamsSchema = z.object({ id: z.string().describe("Venue ID") });

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
      403: problem("Caller is not a Manager of this venue"),
      404: venueNotFound,
      422: {
        description: "`invalid-config`: the draft rule does not validate against the config",
        body: AvailabilityConfigProblemSchema,
      },
    },
  }),
  previewAvailability: defineEndpoint({
    method: "POST",
    path: `${AVAILABILITY_CONFIG_PREFIX}/:id/availability/preview`,
    params: VenueParamsSchema,
    body: PreviewAvailabilityBodySchema,
    responses: {
      200: {
        description:
          "The draft's effect: per-date added/removed times, the focus day, and a page of stranded reservations",
        body: z.object({ data: PreviewResultSchema }),
      },
      401: authRequired,
      403: problem("Caller is not a Manager of this venue"),
      404: venueNotFound,
      422: {
        description: "`invalid-config`, with path-addressed issues",
        body: AvailabilityConfigProblemSchema,
      },
      503: {
        description: "`preview-timeout`: the preview took longer than 5 seconds; retry is safe",
        body: AvailabilityConfigProblemSchema,
      },
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
  check: defineEndpoint({
    method: "POST",
    path: `${AVAILABILITY_CONFIG_PREFIX}/:id/availability/check`,
    params: VenueParamsSchema,
    body: AvailabilityCheckBodySchema,
    responses: {
      200: {
        description: "The booking gate's verdict on this staff booking, with a human message",
        body: z.object({ data: AvailabilityCheckResultSchema }),
      },
      401: authRequired,
      403: notMember,
      404: venueNotFound,
    },
  }),
};
