import {
  DateRuleSchema,
  ScheduleAssignmentSchema,
  ScheduleSchema,
  ScheduleServiceSchema,
  VenueServiceSchema,
} from "@mbe/types";
import type {
  AvailabilityConfig,
  DateRule,
  Schedule,
  ScheduleAssignment,
  ScheduleService,
  VenueService,
  VenueSettings,
} from "@mbe/types";
import { activeHoldWindow, addDays } from "@mbe/availability";
import type { BookingSnapshot, EngineSettings, ServiceDate } from "@mbe/availability";
import type { PrismaClient } from "../generated/prisma/index.js";
import { planVenueMigration } from "./availability-migration.js";
import { prisma } from "./database.js";
import { NOT_BOOKED_STATUSES } from "./slot-rules.js";

/**
 * Loads everything the availability engine needs for a service-date range in a
 * fixed number of queries (one batch per table), independent of range length.
 * Replaces the per-date queries in `availability.ts`
 * (docs/features/venue-availability/architecture.md § Snapshot loader).
 *
 * Venue scope: reads go through the venue-scoped `prisma`, so the caller must
 * already be inside `runWithVenueContext(venueId, …)` (or a `venueScoped` route).
 *
 * jsonb is parsed with the `@mbe/types` row schemas on read. A row that does not
 * parse (an unknown payload `version`, a bad shape) never reaches the engine
 * as-is: a schedule service is dropped (that service is closed), a date rule
 * becomes a whole-day venue closure (fail closed), anything else is dropped.
 * Every such row is reported as a {@link SnapshotWarning}.
 *
 * Venues the operator backfill has not reached (no unarchived regular schedule
 * row) get their schedules built in memory from the legacy `operatingHours`
 * column, by the same pure `planVenueMigration` the backfill runs, so guests see
 * the same slots before and after it. Date rule rows still apply on top. It reads
 * leniently, as the legacy listing did day by day: a day whose hours cannot be
 * read is closed, with one warning per day, and a setting the legacy loop read
 * anyway (an interval above the engine's maximum, a fractional buffer, a stray
 * `version: 1` key) is coerced, with one warning each. Hours that cannot be read at all
 * (unknown shape or version) leave the venue closed, with a warning.
 */

export interface SnapshotWarning {
  table: string;
  id: string;
  reason: string;
}

export interface SnapshotLogger {
  warn(obj: object, msg: string): void;
}

type SnapshotDb = Pick<
  PrismaClient,
  | "venue"
  | "schedule"
  | "venueService"
  | "scheduleService"
  | "scheduleAssignment"
  | "dateRule"
  | "table"
  | "reservation"
  | "reservationHold"
>;

export interface LoadSnapshotOptions {
  /** Defaults to the venue-scoped service client; tests inject their own. */
  db?: SnapshotDb;
  /** Receives one `availability_snapshot_row_invalid` entry per warning. */
  logger?: SnapshotLogger;
}

/** Where the schedules came from: rows, the legacy column (not yet backfilled), or nowhere (closed). */
export type SnapshotSource = "rows" | "legacy" | "none";

export interface LoadedSnapshot {
  snapshot: BookingSnapshot;
  /** `Venue.availabilityVersion` at read time. */
  version: number;
  warnings: SnapshotWarning[];
  source: SnapshotSource;
  /** The venue's full settings (booking window, phone), beyond the engine's subset. */
  venueSettings: VenueSettings | null;
}

export class VenueNotFoundError extends Error {
  constructor(venueId: string) {
    super(`Venue ${venueId} not found`);
    this.name = "VenueNotFoundError";
  }
}

type RowSchema<T> = {
  safeParse(
    value: unknown
  ):
    | { success: true; data: T }
    | { success: false; error: { issues: readonly { path: PropertyKey[]; message: string }[] } };
};

const ALL_RULE_CHANNELS = ["online", "phone", "waitlist"] as const;

const toServiceDate = (d: Date): string => d.toISOString().slice(0, 10);
const toIso = (d: Date | null): string | null => (d === null ? null : d.toISOString());

function failureReason(issues: readonly { path: PropertyKey[]; message: string }[]): string {
  const first = issues[0];
  if (!first) return "invalid row";
  const path = first.path.map(String).join(".");
  return path ? `${path}: ${first.message}` : first.message;
}

/** Parses each candidate; invalid rows go to `onInvalid` instead of the result. */
function parseRows<T>(
  table: string,
  schema: RowSchema<T>,
  candidates: readonly { id: string; value: unknown }[],
  warnings: SnapshotWarning[],
  onInvalid?: (id: string, value: unknown) => T | null
): T[] {
  const parsed: T[] = [];
  for (const { id, value } of candidates) {
    const result = schema.safeParse(value);
    if (result.success) {
      parsed.push(result.data);
      continue;
    }
    warnings.push({ table, id, reason: failureReason(result.error.issues) });
    const replacement = onInvalid?.(id, value);
    if (replacement) parsed.push(replacement);
  }
  return parsed;
}

/** What a rule that cannot be read becomes: the venue is closed on its dates. */
function failClosedRule(row: DateRuleRow): DateRule {
  return {
    kind: "closure",
    id: row.id,
    targetKind: "venue",
    startsOn: toServiceDate(row.startsOn),
    endsOn: row.endsOn ? toServiceDate(row.endsOn) : null,
    guestMessage: row.guestMessage,
  };
}

interface DateRuleRow {
  id: string;
  kind: string;
  targetKind: string;
  venueServiceId: string | null;
  bookingTypes: string[];
  startsOn: Date;
  endsOn: Date | null;
  repeat: unknown;
  window: unknown;
  payload: unknown;
  useScheduleId: string | null;
  seriesId: string | null;
  guestMessage: string | null;
  staffNote: string | null;
  expiresAt: Date | null;
  tables: { tableId: string }[];
}

function dateRuleCandidate(row: DateRuleRow): unknown {
  // The DB stores "no channels listed" as []; for a booking-target rule that means
  // every channel, but the engine reads [] as "affects nothing" — so spell it out.
  // validateConfig rejects the empty form on write; this is the defensive read.
  const bookingTypes =
    row.targetKind === "booking" && row.bookingTypes.length === 0
      ? [...ALL_RULE_CHANNELS]
      : row.bookingTypes;
  return {
    id: row.id,
    kind: row.kind,
    targetKind: row.targetKind,
    venueServiceId: row.venueServiceId,
    bookingTypes,
    tableIds: row.tables.map((t) => t.tableId),
    startsOn: toServiceDate(row.startsOn),
    endsOn: row.endsOn ? toServiceDate(row.endsOn) : null,
    repeat: row.repeat,
    window: row.window,
    payload: row.payload,
    useScheduleId: row.useScheduleId,
    seriesId: row.seriesId,
    guestMessage: row.guestMessage,
    staffNote: row.staffNote,
    expiresAt: toIso(row.expiresAt),
  };
}

const hasRegularSchedule = (config: AvailabilityConfig): boolean =>
  config.schedules.some((s) => s.isRegular && !s.archivedAt);

interface LegacyVenue {
  operatingHours: unknown;
  settings: unknown;
  ianaTimezone: string;
}

/** The config the engine reads: the rows, or the legacy week derived in memory under the rows' date rules. */
function effectiveConfig(
  venueId: string,
  config: AvailabilityConfig,
  venue: LegacyVenue,
  now: Date,
  warnings: SnapshotWarning[]
): { config: AvailabilityConfig; source: SnapshotSource } {
  if (hasRegularSchedule(config)) return { config, source: "rows" };
  const plan = planVenueMigration(venue, now, undefined, { lenient: true });
  if (plan.kind === "migrate") {
    for (const day of plan.notes.unreadableDays ?? []) {
      warnings.push({
        table: "venues",
        id: venueId,
        reason: `legacy operatingHours, day closed: ${day}`,
      });
    }
    for (const coercion of plan.notes.coercions ?? []) {
      warnings.push({ table: "venues", id: venueId, reason: `legacy hours coerced: ${coercion}` });
    }
    return {
      config: { ...plan.config, dateRules: [...plan.config.dateRules, ...config.dateRules] },
      source: "legacy",
    };
  }
  // "no_hours" is a venue with nothing configured, not a bad row.
  if (plan.reason !== "no_hours") {
    const reason = `legacy operatingHours ${plan.reason}${plan.detail ? `: ${plan.detail}` : ""}`;
    warnings.push({ table: "venues", id: venueId, reason });
  }
  return { config, source: "none" };
}

function pickEngineSettings(settings: VenueSettings | null): EngineSettings | null {
  if (!settings) return null;
  const {
    durationRules,
    defaultReservationDuration,
    pacingRules,
    slotIntervalMinutes,
    maxPartySize,
  } = settings;
  return {
    durationRules,
    defaultReservationDuration,
    pacingRules,
    slotIntervalMinutes,
    maxPartySize,
  };
}

export async function loadAvailabilitySnapshot(
  venueId: string,
  fromDate: ServiceDate,
  toDate: ServiceDate,
  now: Date,
  options: LoadSnapshotOptions = {}
): Promise<LoadedSnapshot> {
  const db = options.db ?? prisma;
  // ±1 day: a service that runs past midnight belongs to the day it opens on.
  const windowStart = new Date(addDays(fromDate, -1));
  const windowEnd = new Date(addDays(toDate, 1));
  const dayWindow = { gte: windowStart, lte: windowEnd };

  const [
    venue,
    schedules,
    venueServices,
    scheduleServices,
    assignments,
    dateRules,
    tables,
    reservations,
    holds,
  ] = await Promise.all([
    db.venue.findUnique({
      where: { id: venueId },
      select: {
        ianaTimezone: true,
        settings: true,
        availabilityVersion: true,
        operatingHours: true,
      },
    }),
    db.schedule.findMany({ where: { venueId } }),
    db.venueService.findMany({ where: { venueId }, orderBy: { position: "asc" } }),
    db.scheduleService.findMany({ where: { venueId } }),
    db.scheduleAssignment.findMany({ where: { venueId } }),
    db.dateRule.findMany({
      where: {
        venueId,
        deletedAt: null,
        startsOn: { lte: windowEnd },
        OR: [{ endsOn: null }, { endsOn: { gte: windowStart } }],
      },
      include: { tables: { select: { tableId: true } } },
    }),
    db.table.findMany({
      where: { venueId, isActive: true },
      orderBy: [{ priority: "desc" }, { capacity: "asc" }],
      select: {
        id: true,
        name: true,
        capacity: true,
        minCovers: true,
        maxCovers: true,
        isActive: true,
        priority: true,
      },
    }),
    db.reservation.findMany({
      where: { venueId, date: dayWindow, status: { notIn: [...NOT_BOOKED_STATUSES] } },
      select: { id: true, tableId: true, startTime: true, endTime: true, partySize: true },
    }),
    db.reservationHold.findMany({
      where: { venueId, date: dayWindow, expiresAt: activeHoldWindow(now) },
      select: {
        id: true,
        tableId: true,
        startTime: true,
        endTime: true,
        partySize: true,
        expiresAt: true,
      },
    }),
  ]);

  if (!venue) throw new VenueNotFoundError(venueId);

  const warnings: SnapshotWarning[] = [];

  const rowConfig = {
    schedules: parseRows<Schedule>(
      "schedules",
      ScheduleSchema,
      schedules.map((r) => ({
        id: r.id,
        value: { ...r, archivedAt: toIso(r.archivedAt) },
      })),
      warnings
    ),
    venueServices: parseRows<VenueService>(
      "venue_services",
      VenueServiceSchema,
      venueServices.map((r) => ({
        id: r.id,
        value: { ...r, archivedAt: toIso(r.archivedAt) },
      })),
      warnings
    ),
    scheduleServices: parseRows<ScheduleService>(
      "schedule_services",
      ScheduleServiceSchema,
      scheduleServices.map((r) => ({ id: r.id, value: r })),
      warnings
    ),
    assignments: parseRows<ScheduleAssignment>(
      "schedule_assignments",
      ScheduleAssignmentSchema,
      assignments.map((r) => ({
        id: r.id,
        value: {
          ...r,
          startsOn: r.startsOn ? toServiceDate(r.startsOn) : null,
          endsOn: r.endsOn ? toServiceDate(r.endsOn) : null,
        },
      })),
      warnings
    ),
    dateRules: parseRows<DateRule>(
      "date_rules",
      DateRuleSchema,
      dateRules.map((r) => ({ id: r.id, value: dateRuleCandidate(r) })),
      warnings,
      (id) => {
        const row = dateRules.find((r) => r.id === id);
        return row ? failClosedRule(row) : null;
      }
    ),
  };

  const { config, source } = effectiveConfig(venueId, rowConfig, venue, now, warnings);

  if (options.logger) {
    for (const warning of warnings) {
      options.logger.warn({ venueId, ...warning }, "availability_snapshot_row_invalid");
    }
  }

  const venueSettings = venue.settings as VenueSettings | null;
  return {
    snapshot: {
      timezone: venue.ianaTimezone,
      config,
      tables,
      reservations,
      holds,
      settings: pickEngineSettings(venueSettings),
    },
    version: venue.availabilityVersion,
    warnings,
    source,
    venueSettings,
  };
}
