import { z } from "zod";

/**
 * Venue availability configuration — the layered rows of ADR-030 and the
 * versioned value bundles stored in their jsonb columns.
 *
 * These schemas are structural only: types, ranges and enums. Invariants that
 * span fields or rows (services overlapping, last seating after close, one
 * regular schedule) belong to `validateConfig` in `@mbe/availability`, the one
 * place the layers meet. Every jsonb payload carries `version: 1`, so a row
 * written by a later release fails to parse instead of being misread.
 *
 * Times are minutes past the service day's local midnight (ADR-029). A service
 * that runs past midnight closes after 1440.
 *
 * See docs/features/venue-availability/architecture.md § Data model.
 */

export const SCHEDULE_KINDS = ["regular", "alternate", "holiday"] as const;
export const DATE_RULE_KINDS = [
  "special_hours",
  "closure",
  "use_schedule",
  "skip",
  "tonight",
] as const;
export const DATE_RULE_TARGETS = ["venue", "service", "booking", "tables"] as const;
/** Channels a service is bookable on. `[]` means walk-in only. */
export const SERVICE_BOOKING_TYPES = ["online", "phone"] as const;
/** Channels a date rule can close. */
export const RULE_BOOKING_TYPES = ["online", "phone", "waitlist"] as const;

/** Longest guest-facing message on a date rule, in characters. */
export const GUEST_MESSAGE_MAX_LENGTH = 200;

/** A minute of a service day; up to two days so a past-midnight close fits. */
const MINUTES_IN_TWO_DAYS = 2880;
const MINUTES_PER_DAY = 1440;

export const MinuteSchema = z.number().int().min(0).max(MINUTES_IN_TWO_DAYS);
/** A service opens within its own service day. */
const OpeningMinuteSchema = z
  .number()
  .int()
  .min(0)
  .max(MINUTES_PER_DAY - 1);

/** Venue-local civil date "YYYY-MM-DD". */
export const ServiceDateSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);

/** 0 = Sunday … 6 = Saturday, as stored. */
const WeekdayIndexSchema = z.number().int().min(0).max(6);

const IdSchema = z.string().min(1);

// ── Versioned payloads ──────────────────────────────────────────────────────

export const SeatingSchema = z.union([
  z.strictObject({ version: z.literal(1), interval: z.number().int().min(1).max(240) }),
  z.strictObject({ version: z.literal(1), fixed: z.array(MinuteSchema).min(1) }),
]);

export const WindowSchema = z.object({
  version: z.literal(1),
  from: MinuteSchema,
  to: MinuteSchema,
});

export const RepeatSchema = z.object({
  version: z.literal(1),
  weekdays: z.array(WeekdayIndexSchema).min(1),
});

const ServiceHoursFields = {
  opensAt: OpeningMinuteSchema,
  lastSeatingAt: MinuteSchema,
  closesAt: MinuteSchema,
  seating: SeatingSchema,
  bookingTypes: z.array(z.enum(SERVICE_BOOKING_TYPES)),
};

export const SpecialHoursServiceSchema = z.object({
  venueServiceId: IdSchema,
  ...ServiceHoursFields,
});

export const SpecialHoursPayloadSchema = z.object({
  version: z.literal(1),
  services: z.array(SpecialHoursServiceSchema),
});

/** Exactly one Tonight change per rule: lower pacing, close early, or stop a slot. */
export const TonightPayloadSchema = z.union([
  z.strictObject({
    version: z.literal(1),
    pacing: z.strictObject({ covers: z.number().int().min(1) }),
  }),
  z.strictObject({ version: z.literal(1), closeAt: MinuteSchema }),
  z.strictObject({
    version: z.literal(1),
    stop: z.strictObject({ from: MinuteSchema, to: MinuteSchema }),
  }),
]);

// ── Rows ────────────────────────────────────────────────────────────────────

export const ScheduleSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(60),
  kind: z.enum(SCHEDULE_KINDS),
  isRegular: z.boolean(),
  archivedAt: z.string().nullish(),
});

/** The venue-wide identity of a service ("Dinner"); everything references this, never a name. */
export const VenueServiceSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(40),
  position: z.number().int(),
  archivedAt: z.string().nullish(),
});

export const ScheduleServiceSchema = z.object({
  id: IdSchema,
  scheduleId: IdSchema,
  venueServiceId: IdSchema,
  ...ServiceHoursFields,
});

export const ScheduleAssignmentSchema = z.object({
  id: IdSchema,
  scheduleId: IdSchema,
  weekdays: z.array(WeekdayIndexSchema).min(1),
  startsOn: ServiceDateSchema.nullish(),
  endsOn: ServiceDateSchema.nullish(),
  /** Larger wins where assignments overlap. */
  precedence: z.number().int(),
});

const DateRuleBase = z.object({
  id: IdSchema,
  targetKind: z.enum(DATE_RULE_TARGETS),
  venueServiceId: IdSchema.nullish(),
  bookingTypes: z.array(z.enum(RULE_BOOKING_TYPES)).nullish(),
  tableIds: z.array(IdSchema).nullish(),
  startsOn: ServiceDateSchema,
  /** `null` means "until I reopen". */
  endsOn: ServiceDateSchema.nullish(),
  repeat: RepeatSchema.nullish(),
  /** `null` means the whole service day. */
  window: WindowSchema.nullish(),
  seriesId: IdSchema.nullish(),
  guestMessage: z.string().max(GUEST_MESSAGE_MAX_LENGTH).nullish(),
  staffNote: z.string().max(500).nullish(),
});

export const DateRuleSchema = z.discriminatedUnion("kind", [
  DateRuleBase.extend({
    kind: z.literal("special_hours"),
    payload: SpecialHoursPayloadSchema,
  }),
  DateRuleBase.extend({ kind: z.literal("closure") }),
  DateRuleBase.extend({ kind: z.literal("use_schedule"), useScheduleId: IdSchema }),
  DateRuleBase.extend({ kind: z.literal("skip") }),
  DateRuleBase.extend({
    kind: z.literal("tonight"),
    payload: TonightPayloadSchema,
    expiresAt: z.string().nullish(),
  }),
]);

/** A venue's whole configuration, as flat row lists — issue paths index into these. */
export const AvailabilityConfigSchema = z.object({
  schedules: z.array(ScheduleSchema),
  venueServices: z.array(VenueServiceSchema),
  scheduleServices: z.array(ScheduleServiceSchema),
  assignments: z.array(ScheduleAssignmentSchema),
  dateRules: z.array(DateRuleSchema),
});

export type Seating = z.infer<typeof SeatingSchema>;
export type AvailabilityWindow = z.infer<typeof WindowSchema>;
export type Repeat = z.infer<typeof RepeatSchema>;
export type SpecialHoursService = z.infer<typeof SpecialHoursServiceSchema>;
export type SpecialHoursPayload = z.infer<typeof SpecialHoursPayloadSchema>;
export type TonightPayload = z.infer<typeof TonightPayloadSchema>;
export type Schedule = z.infer<typeof ScheduleSchema>;
export type VenueService = z.infer<typeof VenueServiceSchema>;
export type ScheduleService = z.infer<typeof ScheduleServiceSchema>;
export type ScheduleAssignment = z.infer<typeof ScheduleAssignmentSchema>;
export type DateRule = z.infer<typeof DateRuleSchema>;
export type AvailabilityConfig = z.infer<typeof AvailabilityConfigSchema>;
