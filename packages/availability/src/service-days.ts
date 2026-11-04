import type { ScheduleService, SpecialHoursService, VenueService } from "@mbe/types";
import type { ResolvedService } from "./resolve-day.js";

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
