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
 * The scope is the dates a new or edited dated rule covers, or, for an edit
 * to a schedule's services or assignments, the future dates that schedule
 * runs ("everywhere it is used"). Replaced dates get `skip` rows; no stored
 * rule's range is rewritten.
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
 * Where the returned config came from, chosen exactly as the live listing
 * chooses it: the venue's rows (a live regular schedule); derived from the
 * legacy `operatingHours` column, read leniently (`legacyNotes` lists the days
 * it closed and the values it coerced); `empty` (no hours: closed every day);
 * or `unreadable` (not even the lenient reader can read it, so guests see it
 * closed too; `legacyProblem` says why). Stored rows always come along. A
 * save always writes rows.
 */
export const AVAILABILITY_CONFIG_SOURCES = ["rows", "legacy", "empty", "unreadable"] as const;
export const AvailabilityConfigSourceSchema = z.enum(AVAILABILITY_CONFIG_SOURCES);

export const AvailabilityConfigStateSchema = z.object({
  config: AvailabilityConfigSchema,
  /** `Venue.availabilityVersion`; send it back as `expectedVersion`. */
  version: z.number().int(),
  source: AvailabilityConfigSourceSchema,
  /** `legacy` only: days the lenient reader closed, and values it coerced. */
  legacyNotes: z
    .object({ unreadableDays: z.array(z.string()), coercions: z.array(z.string()) })
    .optional(),
  /** `unreadable` only: why not even the lenient reader could read the hours. */
  legacyProblem: z.object({ reason: z.string(), detail: z.string() }).optional(),
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
  "preview-timeout",
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

/** `POST …/closures/impact`: the draft date rule whose effect on bookings is asked about. */
export const ClosureImpactBodySchema = z.object({ rule: DateRuleSchema });

/** `closed`: the booking's time is gone; `shortened`: hours or a window changed. */
export const CLOSURE_IMPACT_KINDS = ["closed", "shortened"] as const;
export const ClosureImpactKindSchema = z.enum(CLOSURE_IMPACT_KINDS);

export const ClosureImpactReservationSchema = z.object({
  id: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  partySize: z.number().int(),
  guestName: z.string().nullable(),
  /** The deposit held against this booking, if any. */
  deposit: z.object({ amountCents: z.number().int(), currency: z.string() }).nullable(),
  /** Starts before the closure and runs into it. */
  runsIntoClosure: z.boolean(),
});

/** Bookings on one service date that the draft affects the same way. */
export const ClosureImpactGroupSchema = z.object({
  /** `<date>:<kind>`; the closure command's decisions are keyed by it. */
  groupKey: z.string(),
  date: ServiceDateSchema,
  kind: ClosureImpactKindSchema,
  covers: z.number().int(),
  depositsHeld: z.number().int(),
  /** Sorted by start time. */
  reservations: z.array(ClosureImpactReservationSchema),
});

export const ClosureImpactSchema = z.object({
  reservations: z.number().int(),
  covers: z.number().int(),
  depositsHeld: z.number().int(),
  /** By date, then kind. Empty when no booking is affected (e.g. a booking-only closure). */
  groups: z.array(ClosureImpactGroupSchema),
});

export type ClosureImpactBody = z.infer<typeof ClosureImpactBodySchema>;
export type ClosureImpactKind = z.infer<typeof ClosureImpactKindSchema>;
export type ClosureImpactReservation = z.infer<typeof ClosureImpactReservationSchema>;
export type ClosureImpactGroup = z.infer<typeof ClosureImpactGroupSchema>;
export type ClosureImpact = z.infer<typeof ClosureImpactSchema>;

// ── Preview ─────────────────────────────────────────────────────────────────

/** Days of per-date added/removed times a preview returns, from `focusDate`. */
export const PREVIEW_WINDOW_DAYS = 30;
/** Stranded reservations per page. */
export const PREVIEW_STRANDED_PAGE_SIZE = 50;
/** Most dates an explicit scope may list. */
export const PREVIEW_SCOPE_MAX_DATES = 366;

/** Dates the edit reaches: listed, or a range (`to` omitted means onward). */
export const PreviewScopeSchema = z.union([
  z.array(ServiceDateSchema).min(1).max(PREVIEW_SCOPE_MAX_DATES),
  z.object({ from: ServiceDateSchema, to: ServiceDateSchema.optional() }),
]);

export const PreviewAvailabilityBodySchema = z.object({
  /** The unsaved edit: the rows a save would send. */
  draft: z.object({
    changes: AvailabilityConfigChangesSchema,
    scopeConflicts: ScopeConflictModeSchema.default("keep"),
  }),
  scope: PreviewScopeSchema,
  /** First date of the per-date window, and the date resolved in full. */
  focusDate: ServiceDateSchema,
  /** Index of the first stranded reservation to return (a page is 50). */
  strandedOffset: z.number().int().min(0).default(0),
});

/** What guests gain and lose on one date: seating minutes past the service day's midnight. */
export const PreviewDaySchema = z.object({
  serviceDate: ServiceDateSchema,
  added: z.array(z.number().int()),
  removed: z.array(z.number().int()),
});

export const PreviewResultSchema = z.object({
  /** `Venue.availabilityVersion` the preview was computed against. */
  version: z.number().int(),
  days: z.array(PreviewDaySchema),
  /** The focus date under the draft: its summary and the services that run. */
  focusDay: AvailabilityDaySummarySchema.extend({
    services: z.array(
      z.object({
        venueServiceId: z.string(),
        name: z.string(),
        opensAt: z.number().int(),
        lastSeatingAt: z.number().int(),
        closesAt: z.number().int(),
      })
    ),
  }),
  /** Future bookings in scope the draft would leave unserved, by start time. */
  stranded: z.object({
    total: z.number().int(),
    offset: z.number().int(),
    items: z.array(StrandedReservationSchema),
  }),
});

/** What a client sends (defaults optional). */
export type PreviewAvailabilityBody = z.input<typeof PreviewAvailabilityBodySchema>;
/** The body once parsed (defaults applied). */
export type PreviewAvailabilityParsed = z.infer<typeof PreviewAvailabilityBodySchema>;
export type PreviewResult = z.infer<typeof PreviewResultSchema>;
export type PreviewScope = z.infer<typeof PreviewScopeSchema>;

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
