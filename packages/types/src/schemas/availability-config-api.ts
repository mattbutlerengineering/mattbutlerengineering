import { z } from "zod";
import {
  AvailabilityConfigSchema,
  DateRuleSchema,
  DateRuleTargetKindSchema,
  ScheduleAssignmentSchema,
  ScheduleSchema,
  ScheduleServiceSchema,
  ServiceDateSchema,
  VenueServiceSchema,
} from "./availability-config.js";

/**
 * Wire contract of the availability config API (docs/features/
 * venue-availability/architecture.md § Reservations HTTP): `GET`/`PUT
 * …/availability/config` and `GET …/availability/days`.
 */

const IdListSchema = z.array(z.string().min(1));

/**
 * Row operations against the venue's configuration, by table. An upserted row
 * replaces the stored row with the same id, or is created. Removing a schedule
 * or a venue service archives it (other rows reference it); removing a
 * schedule service or an assignment deletes it; removing a date rule
 * soft-deletes it.
 */
export const AvailabilityConfigChangesSchema = z.object({
  upsert: z
    .object({
      schedules: z.array(ScheduleSchema).optional(),
      venueServices: z.array(VenueServiceSchema).optional(),
      scheduleServices: z.array(ScheduleServiceSchema).optional(),
      assignments: z.array(ScheduleAssignmentSchema).optional(),
      dateRules: z.array(DateRuleSchema).optional(),
    })
    .default({}),
  remove: z
    .object({
      schedules: IdListSchema.optional(),
      venueServices: IdListSchema.optional(),
      scheduleServices: IdListSchema.optional(),
      assignments: IdListSchema.optional(),
      dateRules: IdListSchema.optional(),
    })
    .default({}),
});

/**
 * What to do with dates in scope that already have their own hours change
 * (special hours or a use-schedule rule): `keep` theirs, or `replace` them.
 */
export const SCOPE_CONFLICT_MODES = ["keep", "replace"] as const;
export const ScopeConflictModeSchema = z.enum(SCOPE_CONFLICT_MODES);

export const PutAvailabilityConfigBodySchema = z.object({
  /** The `version` the client read; a stale one is refused with 409 `version-conflict`. */
  expectedVersion: z.number().int().min(0),
  changes: AvailabilityConfigChangesSchema,
  scopeConflicts: ScopeConflictModeSchema.default("keep"),
});

/**
 * Where the returned config came from: the venue's rows, derived from the
 * legacy `operatingHours` column (a venue the backfill has not reached), or
 * nothing at all (closed every day). A save always writes rows.
 */
export const AVAILABILITY_CONFIG_SOURCES = ["rows", "legacy", "empty"] as const;
export const AvailabilityConfigSourceSchema = z.enum(AVAILABILITY_CONFIG_SOURCES);

export const AvailabilityConfigStateSchema = z.object({
  config: AvailabilityConfigSchema,
  /** `Venue.availabilityVersion`; send it back as `expectedVersion`. */
  version: z.number().int(),
  source: AvailabilityConfigSourceSchema,
});

export const AvailabilityConfigSaveResultSchema = z.object({
  version: z.number().int(),
  changeId: z.string(),
});

/** The audit row a 409 `version-conflict` names as the change that won. */
export const AvailabilityChangeSummarySchema = z.object({
  id: z.string(),
  actorId: z.string(),
  at: z.string(),
  kind: z.string(),
  summary: z.string(),
});

export const StrandedReservationSchema = z.object({
  id: z.string(),
  startTime: z.string(),
  partySize: z.number().int(),
  reason: z.enum(["closed", "outside_service", "table_blocked"]),
});

export const AVAILABILITY_CONFIG_PROBLEM_CODES = [
  "version-conflict",
  "invalid-config",
  "stranded-bookings",
] as const;

/** RFC 9457 problem with the config API's extension members. */
export const AvailabilityConfigProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  code: z.enum(AVAILABILITY_CONFIG_PROBLEM_CODES),
  /** version-conflict: the latest change; `null` when none is recorded. */
  winningChange: AvailabilityChangeSummarySchema.nullable().optional(),
  /** invalid-config: `validateConfig` issues, path-addressed into the next config. */
  issues: z.array(z.object({ path: z.string(), code: z.string(), message: z.string() })).optional(),
  /** stranded-bookings: future reservations the change would leave outside service. */
  reservations: z.array(StrandedReservationSchema).optional(),
});

/** Longest range `GET …/availability/days` resolves in one call. */
export const AVAILABILITY_DAYS_MAX_RANGE = 62;

export const AvailabilityDaysQuerySchema = z.object({
  from: ServiceDateSchema,
  to: ServiceDateSchema,
});

/** One calendar cell: what the day is called, its closure bands and service count. */
export const AvailabilityDaySummarySchema = z.object({
  serviceDate: ServiceDateSchema,
  /** The schedule name, "Special hours" or "Closed". */
  label: z.string(),
  scheduleId: z.string().nullable(),
  serviceCount: z.number().int(),
  closures: z.array(
    z.object({
      ruleId: z.string(),
      targetKind: DateRuleTargetKindSchema,
      from: z.number().int(),
      to: z.number().int(),
    })
  ),
  bookingOpen: z.object({ online: z.boolean(), phone: z.boolean(), waitlist: z.boolean() }),
  guestMessage: z.string().optional(),
});

export type AvailabilityConfigChanges = z.infer<typeof AvailabilityConfigChangesSchema>;
export type ScopeConflictMode = z.infer<typeof ScopeConflictModeSchema>;
export type PutAvailabilityConfigBody = z.infer<typeof PutAvailabilityConfigBodySchema>;
export type AvailabilityConfigSource = z.infer<typeof AvailabilityConfigSourceSchema>;
export type AvailabilityConfigState = z.infer<typeof AvailabilityConfigStateSchema>;
export type AvailabilityConfigSaveResult = z.infer<typeof AvailabilityConfigSaveResultSchema>;
export type AvailabilityChangeSummary = z.infer<typeof AvailabilityChangeSummarySchema>;
export type StrandedReservation = z.infer<typeof StrandedReservationSchema>;
export type AvailabilityConfigProblem = z.infer<typeof AvailabilityConfigProblemSchema>;
export type AvailabilityDaySummary = z.infer<typeof AvailabilityDaySummarySchema>;
