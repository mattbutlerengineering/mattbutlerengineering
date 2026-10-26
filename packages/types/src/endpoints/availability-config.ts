/**
 * The availability config API, declared once (docs/features/venue-availability/
 * architecture.md § Reservations HTTP). The reservations service registers its
 * routes from these (`registerEndpoint`), and `AvailabilityClient` calls them
 * (`ApiClient.call`).
 */
import { z } from "zod";
import { defineEndpoint, problem } from "./define.js";
import {
  AvailabilityChangesPageSchema,
  AvailabilityChangesQuerySchema,
  AvailabilityCheckBodySchema,
  AvailabilityCheckResultSchema,
  AvailabilityConfigProblemSchema,
  AvailabilityConfigSaveResultSchema,
  AvailabilityConfigStateSchema,
  AvailabilityDaySummarySchema,
  AvailabilityDaysQuerySchema,
  CallListEntrySchema,
  ClosureSummariesSchema,
  ClosureImpactBodySchema,
  ClosureImpactSchema,
  ClosureResultSchema,
  ClosuresResultSchema,
  CreateClosureBodySchema,
  CreateClosuresBodySchema,
  PreviewAvailabilityBodySchema,
  PreviewResultSchema,
  PutAvailabilityConfigBodySchema,
  RetryRefundsResultSchema,
  RevertAvailabilityChangeBodySchema,
  ReopenClosureBodySchema,
  ReopenResultSchema,
  SetTonightBodySchema,
  TonightResultSchema,
} from "../schemas/availability-config-api.js";

/** Mounted under the venues prefix by the reservations service. */
export const AVAILABILITY_CONFIG_PREFIX = "/api/v1/venues";

const VenueParamsSchema = z.object({ id: z.string().describe("Venue ID") });

const ClosureParamsSchema = z.object({
  id: z.string().describe("Venue ID"),
  ruleId: z.string().describe("Date rule ID"),
});

const TonightParamsSchema = ClosureParamsSchema;

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
  createClosures: defineEndpoint({
    method: "POST",
    path: `${AVAILABILITY_CONFIG_PREFIX}/:id/closures/batch`,
    params: VenueParamsSchema,
    body: CreateClosuresBodySchema,
    responses: {
      200: {
        description:
          "Every closure saved in one transaction (or replayed from the same `Idempotency-Key`): the version and one result per item, in order",
        body: z.object({ data: ClosuresResultSchema }),
      },
      400: problem("Missing `Idempotency-Key` header, or a date range too long to evaluate"),
      401: authRequired,
      403: problem("Caller is not a Manager of this venue"),
      404: venueNotFound,
      409: {
        description:
          "`version-conflict`, `idempotency-key-reused` or `closure-exists` (a rule id was already saved, or appears twice)",
        body: AvailabilityConfigProblemSchema,
      },
      422: {
        description:
          "`invalid-config`, `decision-required`, `invalid-decision` or `move-unavailable`; none of the items is saved",
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
  listClosures: defineEndpoint({
    method: "GET",
    path: `${AVAILABILITY_CONFIG_PREFIX}/:id/closures`,
    params: VenueParamsSchema,
    responses: {
      200: {
        description:
          "One summary per date rule that produced closure outcomes (closures and Tonight close-early, reopened or ended ones included): Sent / Rebooked / Unreachable and refund counts",
        body: z.object({ data: ClosureSummariesSchema }),
      },
      401: authRequired,
      403: notMember,
      404: venueNotFound,
    },
  }),
  closureCallList: defineEndpoint({
    method: "GET",
    path: `${AVAILABILITY_CONFIG_PREFIX}/:id/closures/:ruleId/call-list`,
    params: ClosureParamsSchema,
    responses: {
      200: {
        description:
          "Guests the closure told but without a confirmed delivery or a rebooking: name, party, time and phone",
        body: z.object({ data: z.array(CallListEntrySchema) }),
      },
      401: authRequired,
      403: notMember,
      404: venueNotFound,
    },
  }),
  retryClosureRefunds: defineEndpoint({
    method: "POST",
    path: `${AVAILABILITY_CONFIG_PREFIX}/:id/closures/:ruleId/refunds/retry`,
    params: ClosureParamsSchema,
    responses: {
      200: {
        description:
          "Re-enqueued the closure's refunds that are `pending` or `failed` (never `done` or `none`, so nothing is refunded twice); works for a reopened closure or an ended Tonight change",
        body: z.object({ data: RetryRefundsResultSchema }),
      },
      401: authRequired,
      403: notClosureCaller,
      404: venueNotFound,
      503: problem(
        "The job queue failed partway; the detail says how many refunds were already queued. A row is only reset once its job exists, so retrying is safe"
      ),
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
  setTonight: defineEndpoint({
    method: "POST",
    path: `${AVAILABILITY_CONFIG_PREFIX}/:id/tonight`,
    params: VenueParamsSchema,
    body: SetTonightBodySchema,
    responses: {
      200: {
        description:
          "Saved for the current service day, ending at its boundary (or replayed from the same `ruleId`): the rule, the version, the day, `expiresAt` and outcome counts (all zero unless a close-early cancelled or moved bookings)",
        body: z.object({ data: TonightResultSchema }),
      },
      401: authRequired,
      403: notMember,
      404: venueNotFound,
      409: {
        description:
          "`version-conflict`, or `closure-exists` (this rule id was already used with a different change)",
        body: AvailabilityConfigProblemSchema,
      },
      422: {
        description:
          "`invalid-config`, or for a close-early with bookings `decision-required`, `invalid-decision` or `move-unavailable`",
        body: AvailabilityConfigProblemSchema,
      },
    },
  }),
  endTonight: defineEndpoint({
    method: "DELETE",
    path: `${AVAILABILITY_CONFIG_PREFIX}/:id/tonight/:ruleId`,
    params: TonightParamsSchema,
    responses: {
      200: {
        description: "Ended; bookings a close-early cancelled stay cancelled",
        body: z.object({ data: ReopenResultSchema }),
      },
      401: authRequired,
      403: notMember,
      404: problem("Venue or Tonight change not found"),
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
  listChanges: defineEndpoint({
    method: "GET",
    path: `${AVAILABILITY_CONFIG_PREFIX}/:id/availability/changes`,
    params: VenueParamsSchema,
    query: AvailabilityChangesQuerySchema,
    responses: {
      200: {
        description: "A page of the venue's availability history, newest first",
        body: z.object({ data: AvailabilityChangesPageSchema }),
      },
      401: authRequired,
      403: notMember,
      404: venueNotFound,
    },
  }),
  revertChange: defineEndpoint({
    method: "POST",
    path: `${AVAILABILITY_CONFIG_PREFIX}/:id/availability/changes/:changeId/revert`,
    params: VenueParamsSchema.extend({ changeId: z.string().describe("Availability change ID") }),
    body: RevertAvailabilityChangeBodySchema,
    responses: {
      200: {
        description: "Reverted as a new save; the new version and the revert's audit row id",
        body: z.object({ data: AvailabilityConfigSaveResultSchema }),
      },
      401: authRequired,
      403: problem("Caller is not a Manager of this venue"),
      404: problem("Venue or change not found"),
      409: {
        description:
          "`version-conflict`, `stranded-bookings`, `guests-notified`, `already-reverted`, `superseded` or `not-revertable`",
        body: AvailabilityConfigProblemSchema,
      },
      422: {
        description: "`invalid-config`: the stored inverse no longer validates",
        body: AvailabilityConfigProblemSchema,
      },
    },
  }),
};
