import { z } from "zod";
import {
  AvailabilityConfigSchema,
  ClosureActionSchema,
  DateRuleSchema,
  DateRuleTargetKindSchema,
  GUEST_MESSAGE_MAX_LENGTH,
  MinuteSchema,
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

/** One row of the history drawer: the audit row, plus whether undo is still on offer. */
export const AvailabilityChangeEntrySchema = AvailabilityChangeSummarySchema.extend({
  /** First and last service dates the change can alter; `null` end means onward. */
  affectedFrom: ServiceDateSchema.nullable(),
  affectedTo: ServiceDateSchema.nullable(),
  /** Whether guests were told; a change that told them can never be undone. */
  notifiedGuests: z.boolean(),
  /** The change that undid this one. */
  revertedById: z.string().nullable(),
  /** `Revert` is offered only on the newest change, and only when it told no guest. */
  revertible: z.boolean(),
});

/** Most entries one `GET …/availability/changes` page returns. */
export const AVAILABILITY_CHANGES_MAX_LIMIT = 100;

export const AvailabilityChangesQuerySchema = z.object({
  /** Made on or after this UTC date. */
  from: ServiceDateSchema.optional(),
  /** Made on or before this UTC date. */
  to: ServiceDateSchema.optional(),
  actorId: z.string().min(1).optional(),
  kind: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(AVAILABILITY_CHANGES_MAX_LIMIT).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export const AvailabilityChangesPageSchema = z.object({
  total: z.number().int(),
  offset: z.number().int(),
  /** Newest first. */
  items: z.array(AvailabilityChangeEntrySchema),
});

/** `POST …/availability/changes/:changeId/revert`: the version the client read, for the compare-and-set. */
export const RevertAvailabilityChangeBodySchema = z.object({
  expectedVersion: z.number().int().min(0),
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
  "decision-required",
  "invalid-decision",
  "move-unavailable",
  "idempotency-key-reused",
  "closure-exists",
  "preview-timeout",
  "guests-notified",
  "already-reverted",
  "superseded",
  "not-revertable",
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
  /** decision-required / invalid-decision: the impact groups at fault. */
  groupKeys: z.array(z.string()).optional(),
  /** move-unavailable: bookings with no open time to move to. */
  reservationIds: z.array(z.string()).optional(),
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
/** Soft limits the engine reports; a staff override with a reason can pass them. */
export const SOFT_LIMITS = ["after_last_seating", "pacing", "party_size"] as const;
export const SoftLimitSchema = z.enum(SOFT_LIMITS);

/** Why a booking is refused outright; no override passes these. */
export const HARD_REASONS = [
  "closed",
  "booking_closed",
  "outside_service",
  "table_blocked",
  "conflict",
] as const;
export const HardReasonSchema = z.enum(HARD_REASONS);

/** `POST …/availability/check`: would the booking gate take this staff (phone) booking? */
export const AvailabilityCheckBodySchema = z.object({
  start: z.iso.datetime({ offset: true }).describe("Start time (ISO 8601)"),
  end: z.iso
    .datetime({ offset: true })
    .describe("End time (ISO 8601); send the booking's real end, omit to estimate from party size")
    .optional(),
  partySize: z.number().int().min(1).describe("Number of guests"),
  channel: z.literal("phone").describe("Staff checks are phone bookings"),
  tableId: z.string().describe("Table to check; omit to ask whether any table is free").optional(),
});

/** The engine's verdict, with the human message the staff form shows. */
export const AvailabilityCheckResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ok") }),
  z.object({ kind: z.literal("soft"), limits: z.array(SoftLimitSchema), message: z.string() }),
  z.object({ kind: z.literal("hard"), reason: HardReasonSchema, message: z.string() }),
]);

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
export type AvailabilityChangeEntry = z.infer<typeof AvailabilityChangeEntrySchema>;
export type AvailabilityChangesQuery = z.input<typeof AvailabilityChangesQuerySchema>;
export type AvailabilityChangesParsed = z.infer<typeof AvailabilityChangesQuerySchema>;
export type AvailabilityChangesPage = z.infer<typeof AvailabilityChangesPageSchema>;
export type RevertAvailabilityChangeBody = z.infer<typeof RevertAvailabilityChangeBodySchema>;
export type StrandedReservation = z.infer<typeof StrandedReservationSchema>;
export type AvailabilityConfigProblem = z.infer<typeof AvailabilityConfigProblemSchema>;
export type AvailabilityDaySummary = z.infer<typeof AvailabilityDaySummarySchema>;

// ── Closure command ─────────────────────────────────────────────────────────

/**
 * What the Manager chose for one impact group (architecture.md § Closure
 * command). `move` is offered only for a `shortened` group; `keep_silent`
 * needs `acknowledged: true` (the "I understand 14 guests won't be told" box).
 */
export const ClosureDecisionSchema = z.object({
  /** The impact group's `groupKey` (`<date>:<kind>`). */
  groupKey: z.string().min(1),
  action: ClosureActionSchema,
  acknowledged: z.boolean().optional(),
});

/** `POST …/closures`: the rule, the version the client read, and one decision per impact group. */
export const CreateClosureBodySchema = z.object({
  expectedVersion: z.number().int().min(0),
  rule: DateRuleSchema,
  decisions: z.array(ClosureDecisionSchema).default([]),
});

/** `DELETE …/closures/:ruleId`. */
export const ReopenClosureBodySchema = z.object({ tellCancelledGuests: z.boolean() });

export const ClosureOutcomeCountsSchema = z.object({
  cancel: z.number().int(),
  move: z.number().int(),
  keep_notify: z.number().int(),
  keep_silent: z.number().int(),
});

export const ClosureResultSchema = z.object({
  ruleId: z.string(),
  /** `Venue.availabilityVersion` after the save. */
  version: z.number().int(),
  changeId: z.string(),
  outcomes: ClosureOutcomeCountsSchema,
});

export const ReopenResultSchema = z.object({ version: z.number().int(), changeId: z.string() });

/**
 * What became of the reservations one closure (or Tonight close-early) touched,
 * keyed by the date rule that made it. Rows exist even after the rule is gone
 * (a reopened closure, an ended Tonight change), so refunds can still be retried.
 */
export const RefundFailureSchema = z.object({
  outcomeId: z.string(),
  /** The guest's name as booked; no email or phone travels here. */
  guestName: z.string().nullable(),
  /** The deposit being refunded, in integer minor units; null when no deposit is on file. */
  amountCents: z.number().int().nullable(),
  currency: z.string().nullable(),
});

export const ClosureSummarySchema = z.object({
  ruleId: z.string(),
  /** Outcomes the closure produced. */
  total: z.number().int(),
  /** Bookings the closure cancelled (the guests a reopen notice would go to). */
  cancelled: z.number().int(),
  /** Guests with a confirmed email or SMS delivery. */
  sent: z.number().int(),
  /** Guests who rebooked after the cancel. */
  rebooked: z.number().int(),
  /** Told but with no confirmed delivery and no rebooking: the call list. */
  unreachable: z.number().int(),
  /** Deposit refunds the refund job gave up on. */
  refundFailed: z.number().int(),
  /** The failed refunds, named, for "Refund failed: Rivera ($40)". */
  refundFailures: z.array(RefundFailureSchema),
  /** Deposit refunds not yet settled (also retried: the enqueue itself may have been lost). */
  refundPending: z.number().int(),
});

export const ClosureSummariesSchema = z.array(ClosureSummarySchema);

export const RetryRefundsResultSchema = z.object({ enqueued: z.number().int() });

export const CallListEntrySchema = z.object({
  outcomeId: z.string(),
  reservationId: z.string(),
  guestName: z.string().nullable(),
  partySize: z.number().int(),
  /** ISO instant of the reservation's start. */
  startTime: z.string(),
  guestPhone: z.string().nullable(),
});

// ── Tonight ─────────────────────────────────────────────────────────────────

const TonightIdSchema = z.string().min(1);

/**
 * One Tonight change a Host or Manager makes (ux.md F7). The server turns it
 * into a `tonight` date rule for the current service day: pause online is a
 * whole-day stop on the online channel, a table block is a stop on `tableIds`
 * (to the end of tonight when `to` is omitted).
 */
export const TonightChangeSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("pause_online") }),
  z.strictObject({
    type: z.literal("close_early"),
    closeAt: MinuteSchema,
    /** Close one service early; omitted closes every service. */
    venueServiceId: TonightIdSchema.optional(),
  }),
  z.strictObject({ type: z.literal("stop_window"), from: MinuteSchema, to: MinuteSchema }),
  z.strictObject({
    type: z.literal("block_tables"),
    tableIds: z.array(TonightIdSchema).min(1),
    from: MinuteSchema.optional(),
    to: MinuteSchema.optional(),
  }),
  z.strictObject({ type: z.literal("pacing"), covers: z.number().int().min(1) }),
]);

/**
 * `POST …/tonight`. `ruleId` is chosen by the client and doubles as the
 * idempotency handle: sending the same id again replays the first result.
 * `decisions` answer a close-early's affected groups, as for a closure.
 */
export const SetTonightBodySchema = z.object({
  expectedVersion: z.number().int().min(0),
  ruleId: TonightIdSchema,
  change: TonightChangeSchema,
  guestMessage: z.string().max(GUEST_MESSAGE_MAX_LENGTH).optional(),
  staffNote: z.string().max(500).optional(),
  decisions: z.array(ClosureDecisionSchema).default([]),
});

export const TonightResultSchema = ClosureResultSchema.extend({
  /** The service day the change applies to. */
  serviceDate: ServiceDateSchema,
  /** When it ends: the service day's boundary, as an ISO instant. */
  expiresAt: z.string(),
});

export type TonightChange = z.infer<typeof TonightChangeSchema>;
export type SetTonightBody = z.infer<typeof SetTonightBodySchema>;
export type TonightResult = z.infer<typeof TonightResultSchema>;

export type ClosureDecision = z.infer<typeof ClosureDecisionSchema>;
export type CreateClosureBody = z.infer<typeof CreateClosureBodySchema>;
export type ReopenClosureBody = z.infer<typeof ReopenClosureBodySchema>;
export type ClosureResult = z.infer<typeof ClosureResultSchema>;
export type ReopenResult = z.infer<typeof ReopenResultSchema>;
export type RefundFailure = z.infer<typeof RefundFailureSchema>;
export type ClosureSummary = z.infer<typeof ClosureSummarySchema>;
export type RetryRefundsResult = z.infer<typeof RetryRefundsResultSchema>;
export type ClosureCallListEntry = z.infer<typeof CallListEntrySchema>;
export type AvailabilityCheckBody = z.infer<typeof AvailabilityCheckBodySchema>;
export type AvailabilityCheckResult = z.infer<typeof AvailabilityCheckResultSchema>;
