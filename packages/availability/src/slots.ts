import { addDays } from "./civil-date.js";
import { localDateTimeOf, serviceDayInstant } from "./instant.js";
import {
  resolveDay,
  type AvailabilitySnapshot,
  type ResolvedClosure,
  type ResolvedDaySummary,
  type ResolvedService,
} from "./resolve-day.js";
import {
  checkPacingForSlot,
  checkTableConflict,
  estimateDuration,
  filterSuitableTables,
  type EngineSettings,
  type HoldSlim,
  type ReservationSlim,
  type TableFilter,
} from "./slot-rules.js";
import { MINUTES_PER_DAY, type ServiceDate } from "./types.js";

/**
 * Slot listing and the booking verdict — the two questions every booking path
 * asks, answered from one snapshot (ADR-030). Closures are always hard; soft
 * limits yield to a staff override with a reason.
 */

const MS_PER_MINUTE = 60_000;

export type BookingChannel = "online" | "phone";

export interface EngineTable extends TableFilter {
  name: string;
  priority: number;
}

/** A configuration snapshot plus the inventory and bookings slots are judged against. */
export interface BookingSnapshot extends AvailabilitySnapshot {
  tables: EngineTable[];
  /** Non-cancelled reservations for the range, ±1 day. */
  reservations: ReservationSlim[];
  holds: HoldSlim[];
  settings: EngineSettings | null;
}

export interface Slot {
  start: Date;
  serviceDate: ServiceDate;
  /** Minutes past the service day's midnight; may exceed 1440. */
  minute: number;
  venueServiceId: string;
  /** Suitable tables that are free and not blocked, in snapshot order. */
  tables: EngineTable[];
  available: boolean;
  reason?: "no_table" | "pacing";
}

export type SoftLimit = "after_last_seating" | "pacing" | "party_size";
export type HardReason =
  "closed" | "booking_closed" | "outside_service" | "table_blocked" | "conflict";

export type Verdict =
  | { kind: "ok" }
  | { kind: "ok_with_override"; limits: SoftLimit[] }
  | { kind: "soft"; limits: SoftLimit[] }
  | { kind: "hard"; reason: HardReason; message?: string };

export interface BookingRequest {
  start: Date;
  partySize: number;
  channel: BookingChannel;
  tableId?: string;
  override?: { reason: string };
}

/** Seatings from opening to last seating — never at or after close, so judge accepts every one. */
function seatingMinutes(service: ResolvedService): number[] {
  const { opensAt, lastSeatingAt, closesAt, seating } = service;
  const bookable = (m: number) => m >= opensAt && m <= lastSeatingAt && m < closesAt;
  if ("interval" in seating) {
    const count = Math.floor((lastSeatingAt - opensAt) / seating.interval) + 1;
    return Array.from(
      { length: Math.max(count, 0) },
      (_, k) => opensAt + k * seating.interval
    ).filter(bookable);
  }
  return [...new Set(seating.fixed)].filter(bookable).sort((a, b) => a - b);
}

function inBand(band: ResolvedClosure, minute: number): boolean {
  return band.from <= minute && minute < band.to;
}

/** Does a closure band stop a seating of this service on this channel? Table bands only block tables. */
function closesSeating(
  band: ResolvedClosure,
  minute: number,
  venueServiceId: string,
  channel: BookingChannel
): boolean {
  if (!inBand(band, minute)) return false;
  switch (band.targetKind) {
    case "venue":
      return true;
    case "service":
      return band.venueServiceId === venueServiceId;
    case "booking":
      return (band.bookingTypes ?? []).includes(channel);
    case "tables":
      return false;
  }
}

function blockedTables(day: ResolvedDaySummary, minute: number): Set<string> {
  return new Set(
    day.closures
      .filter((b) => b.targetKind === "tables" && inBand(b, minute))
      .flatMap((b) => b.tableIds ?? [])
  );
}

function freeTables(
  snapshot: BookingSnapshot,
  day: ResolvedDaySummary,
  minute: number,
  partySize: number,
  start: Date,
  now: Date
): EngineTable[] {
  const end = new Date(
    start.getTime() + estimateDuration(partySize, snapshot.settings) * MS_PER_MINUTE
  );
  const blocked = blockedTables(day, minute);
  return filterSuitableTables(snapshot.tables, partySize).filter(
    (t) =>
      !blocked.has(t.id) &&
      !checkTableConflict(t.id, start, end, snapshot.reservations, snapshot.holds, now)
  );
}

function pacingOk(
  snapshot: BookingSnapshot,
  day: ResolvedDaySummary,
  start: Date,
  partySize: number,
  now: Date
): boolean {
  return checkPacingForSlot(
    start,
    partySize,
    snapshot.settings,
    snapshot.reservations,
    snapshot.holds,
    now,
    day.pacingCovers
  );
}

/**
 * Every seating of `serviceDate` open to `channel`, with its free tables. A
 * seating inside a closure band, or in a spring-forward gap, is left out.
 * The booking window (advance limits) stays with the caller.
 */
export function listSlots(
  snapshot: BookingSnapshot,
  serviceDate: ServiceDate,
  partySize: number,
  channel: BookingChannel,
  now: Date
): Slot[] {
  const day = resolveDay(snapshot, serviceDate);
  if (!day.bookingOpen[channel]) return [];
  return day.services
    .filter((service) => service.bookingTypes.includes(channel))
    .flatMap((service) =>
      seatingMinutes(service).flatMap((minute): Slot[] => {
        if (day.closures.some((b) => closesSeating(b, minute, service.venueServiceId, channel))) {
          return [];
        }
        const start = serviceDayInstant(serviceDate, minute, snapshot.timezone);
        if (!start) return [];
        const tables = freeTables(snapshot, day, minute, partySize, start, now);
        const paced = pacingOk(snapshot, day, start, partySize, now);
        return [
          {
            start,
            serviceDate,
            minute,
            venueServiceId: service.venueServiceId,
            tables,
            available: tables.length > 0 && paced,
            ...(tables.length === 0 ? { reason: "no_table" as const } : {}),
            ...(tables.length > 0 && !paced ? { reason: "pacing" as const } : {}),
          },
        ];
      })
    );
}

const containing = (minute: number) => (s: ResolvedService) =>
  s.opensAt <= minute && minute < s.closesAt;

/** The day as planned, before closures and Tonight changes. */
function plannedDay(snapshot: AvailabilitySnapshot, serviceDate: ServiceDate) {
  const dateRules = snapshot.config.dateRules.filter(
    (r) => r.kind !== "closure" && r.kind !== "tonight"
  );
  return resolveDay({ ...snapshot, config: { ...snapshot.config, dateRules } }, serviceDate);
}

/**
 * The service day that owns an instant: its own calendar date, or the day
 * before when a past-midnight service is running (ADR-029).
 */
function owningServiceDay(snapshot: AvailabilitySnapshot, start: Date) {
  const local = localDateTimeOf(start, snapshot.timezone);
  const candidates = [
    { serviceDate: local.date, minute: local.minute },
    { serviceDate: addDays(local.date, -1), minute: local.minute + MINUTES_PER_DAY },
  ];
  return candidates.flatMap(({ serviceDate, minute }) => {
    const planned = plannedDay(snapshot, serviceDate).services.find(containing(minute));
    return planned ? [{ serviceDate, minute, planned }] : [];
  })[0];
}

function hard(reason: HardReason, message?: string): Verdict {
  return message ? { kind: "hard", reason, message } : { kind: "hard", reason };
}

function tableVerdict(
  snapshot: BookingSnapshot,
  day: ResolvedDaySummary,
  minute: number,
  request: BookingRequest,
  now: Date
): Verdict | null {
  const free = freeTables(snapshot, day, minute, request.partySize, request.start, now);
  if (request.tableId === undefined) return free.length > 0 ? null : hard("conflict");
  if (blockedTables(day, minute).has(request.tableId)) return hard("table_blocked");
  return free.some((t) => t.id === request.tableId) ? null : hard("conflict");
}

function softLimits(
  snapshot: BookingSnapshot,
  day: ResolvedDaySummary,
  service: ResolvedService,
  minute: number,
  request: BookingRequest,
  now: Date
): SoftLimit[] {
  const maxParty = snapshot.settings?.maxPartySize;
  return [
    ...(minute > service.lastSeatingAt ? ["after_last_seating" as const] : []),
    ...(pacingOk(snapshot, day, request.start, request.partySize, now) ? [] : ["pacing" as const]),
    ...(maxParty !== undefined && request.partySize > maxParty ? ["party_size" as const] : []),
  ];
}

/** Can this booking be made? Closures and missing tables are hard; limits are soft. */
export function judge(snapshot: BookingSnapshot, request: BookingRequest, now: Date): Verdict {
  const owner = owningServiceDay(snapshot, request.start);
  if (!owner) return hard("outside_service");
  const { serviceDate, minute, planned } = owner;
  const day = resolveDay(snapshot, serviceDate);
  const message = day.guestMessage;

  const band = day.closures.find((b) =>
    closesSeating(b, minute, planned.venueServiceId, request.channel)
  );
  if (band) return hard(band.targetKind === "booking" ? "booking_closed" : "closed", message);
  if (!day.bookingOpen[request.channel]) return hard("booking_closed", message);
  const service = day.services
    .filter((s) => s.venueServiceId === planned.venueServiceId)
    .find(containing(minute));
  if (!service) return hard("closed", message);
  if (!service.bookingTypes.includes(request.channel)) return hard("booking_closed", message);

  const tableIssue = tableVerdict(snapshot, day, minute, request, now);
  if (tableIssue) return tableIssue;

  const limits = softLimits(snapshot, day, service, minute, request, now);
  if (limits.length === 0) return { kind: "ok" };
  const overridden = request.channel === "phone" && (request.override?.reason.trim() ?? "") !== "";
  return overridden ? { kind: "ok_with_override", limits } : { kind: "soft", limits };
}
