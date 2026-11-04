import type { ScheduleService, SpecialHoursService, VenueService } from "@mbe/types";
import type { ResolvedService } from "./types.js";

/**
 * Which hours a service row has on a weekday (ADR-031). A row's base hours apply on its own
 * `weekdays` (every day its assignment covers when empty); an hour set in `dayHours` replaces
 * them on the weekdays it claims. `hoursOn` is the one place that reads those two fields, so
 * every reader of a schedule's rows asks it.
 */

export type ServiceHours = Pick<
  ScheduleService,
  "opensAt" | "lastSeatingAt" | "closesAt" | "seating" | "bookingTypes"
>;

function hoursFields(hours: ServiceHours): ServiceHours {
  return {
    opensAt: hours.opensAt,
    lastSeatingAt: hours.lastSeatingAt,
    closesAt: hours.closesAt,
    seating: hours.seating,
    bookingTypes: hours.bookingTypes,
  };
}

/** Where a weekday's hours come from: an hour set (by index into `dayHours.sets`) or the base. */
export interface HoursSource {
  hours: ServiceHours;
  /** Index into `dayHours.sets`; `null` for the base hours. */
  setIndex: number | null;
}

type DayScopedRow = Pick<ScheduleService, "weekdays" | "dayHours" | keyof ServiceHours>;

/**
 * The hours the row has on `weekday` (0 = Sunday) and which of its sets or base they come from,
 * or `null` when it does not run then. A weekday two sets claim resolves to the first listed;
 * `validateConfig` refuses such a row at every save.
 */
export function hoursSourceOn(row: DayScopedRow, weekday: number): HoursSource | null {
  const setIndex = row.dayHours.sets.findIndex((s) => s.weekdays.includes(weekday));
  const set = row.dayHours.sets[setIndex];
  if (set) return { hours: hoursFields(set), setIndex };
  return row.weekdays.length === 0 || row.weekdays.includes(weekday)
    ? { hours: hoursFields(row), setIndex: null }
    : null;
}

/** The hours the row has on `weekday` (0 = Sunday), or `null` when it does not run then. */
export function hoursOn(row: DayScopedRow, weekday: number): ServiceHours | null {
  return hoursSourceOn(row, weekday)?.hours ?? null;
}

function toResolved(
  service: ScheduleService | SpecialHoursService,
  venueService: VenueService
): ResolvedService {
  return {
    scheduleServiceId: "id" in service ? service.id : null,
    venueServiceId: service.venueServiceId,
    name: venueService.name,
    opensAt: service.opensAt,
    lastSeatingAt: service.lastSeatingAt,
    closesAt: service.closesAt,
    seating: service.seating,
    bookingTypes: service.bookingTypes,
  };
}

/** The services whose venue service is live, in opening order. */
export function liveServices(
  services: readonly (ScheduleService | SpecialHoursService)[],
  venueServices: ReadonlyMap<string, VenueService>
): ResolvedService[] {
  return services
    .flatMap((s) => {
      const venueService = venueServices.get(s.venueServiceId);
      return venueService ? [toResolved(s, venueService)] : [];
    })
    .sort((a, b) => a.opensAt - b.opensAt);
}

/** The live services of a schedule's rows that run on `weekday`, with that day's hours, in opening order. */
export function servicesOn(
  rows: readonly ScheduleService[],
  venueServices: ReadonlyMap<string, VenueService>,
  weekday: number
): ResolvedService[] {
  return liveServices(
    rows.flatMap((row) => {
      const hours = hoursOn(row, weekday);
      return hours ? [{ ...row, ...hours }] : [];
    }),
    venueServices
  );
}

// ── The week as an editor sees it, and the canonical rows it is stored as ─────────────────────

/** One service's hours on each weekday, indexed 0 = Sunday … 6 = Saturday; `null` = does not run. */
export interface ServiceWeek {
  venueServiceId: string;
  days: readonly (ServiceHours | null)[];
}

/** A regular week: each service with its own days and hours. A service that runs on no day is not in it. */
export type Week = readonly ServiceWeek[];

/** A schedule service row without the ids a caller gives it. */
export type EncodedRow = Pick<
  ScheduleService,
  "venueServiceId" | "weekdays" | "dayHours" | keyof ServiceHours
>;

/** Monday first, as a week reads. */
export const WEEK_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

function hoursKey(h: ServiceHours): string {
  const seating =
    "interval" in h.seating
      ? ["i", h.seating.interval]
      : ["f", [...h.seating.fixed].sort((a, b) => a - b)];
  // Order is not meaning: the same booking types or fixed times in another order are the same hours.
  const bookingTypes = [...h.bookingTypes].sort();
  return JSON.stringify([h.opensAt, h.lastSeatingAt, h.closesAt, seating, bookingTypes]);
}

interface HoursGroup {
  hours: ServiceHours;
  /** In Monday-first order. */
  days: number[];
}

/** The days a service runs, grouped by identical hours, biggest group first (a tie: earliest Monday-first day). */
function groupByHours(week: ServiceWeek, coveredDays: ReadonlySet<number>): HoursGroup[] {
  const groups = new Map<string, HoursGroup>();
  for (const day of WEEK_ORDER) {
    const hours = week.days[day];
    if (!hours || !coveredDays.has(day)) continue;
    const key = hoursKey(hours);
    const group = groups.get(key);
    if (group) group.days.push(day);
    else groups.set(key, { hours: hoursFields(hours), days: [day] });
  }
  // Insertion order is first-Monday-first-day order, and sort is stable, so size breaks the rest.
  return [...groups.values()].sort((a, b) => b.days.length - a.days.length);
}

/**
 * The canonical rows for a week over the days its assignment covers. Per service the base is the
 * hours most of its days share (a tie goes to the group holding the earliest Monday-first day);
 * `weekdays` is empty exactly when the base days equal the covered days minus the sets' days;
 * every other hours become a set, ordered by its first Monday-first day. Same week, same rows:
 * re-saving an unchanged week churns nothing.
 */
export function encodeWeek(week: Week, coveredDays: readonly number[]): EncodedRow[] {
  const covered = new Set(coveredDays);
  return week.flatMap((service) => {
    const [base, ...others] = groupByHours(service, covered);
    if (!base) return [];
    const sets = others
      .sort((a, b) => WEEK_ORDER.indexOf(a.days[0] ?? 0) - WEEK_ORDER.indexOf(b.days[0] ?? 0))
      .map((g) => ({ weekdays: g.days, ...g.hours }));
    const claimed = new Set(others.flatMap((g) => g.days));
    const implicit = WEEK_ORDER.filter((d) => covered.has(d) && !claimed.has(d));
    const baseIsEveryOtherDay =
      implicit.length === base.days.length && implicit.every((d, i) => d === base.days[i]);
    return [
      {
        venueServiceId: service.venueServiceId,
        ...base.hours,
        weekdays: baseIsEveryOtherDay ? [] : base.days,
        dayHours: { version: 1 as const, sets },
      },
    ];
  });
}

/** The week a schedule's rows give over the days its assignment covers; the inverse of `encodeWeek`. */
export function decodeWeek(
  rows: readonly (Pick<ScheduleService, "weekdays" | "dayHours" | keyof ServiceHours> & {
    venueServiceId: string;
  })[],
  coveredDays: readonly number[]
): Week {
  const covered = new Set(coveredDays);
  return rows.flatMap((row) => {
    const days = Array.from({ length: 7 }, (_, day) =>
      covered.has(day) ? hoursOn(row, day) : null
    );
    return days.some((h) => h !== null) ? [{ venueServiceId: row.venueServiceId, days }] : [];
  });
}
