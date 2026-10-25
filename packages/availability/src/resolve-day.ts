import type {
  AvailabilityConfig,
  ScheduleAssignment,
  ScheduleService,
  VenueService,
} from "@mbe/types";
import { weekdayIndexOf } from "./civil-date.js";
import type { ServiceDate } from "./types.js";

/**
 * Resolves the layer stack for one service day (ADR-030). A service belongs
 * to the service day it opens on, so a service that runs past midnight is
 * part of its start day and never of the next calendar date (ADR-029).
 *
 * This layer covers schedules and weekday assignments; date rules layer on
 * top of it.
 */

/** Everything the engine needs, loaded once and computed against many times. */
export interface AvailabilitySnapshot {
  /** IANA zone of the venue. */
  timezone: string;
  config: AvailabilityConfig;
}

export interface ResolvedService extends Pick<
  ScheduleService,
  "venueServiceId" | "opensAt" | "lastSeatingAt" | "closesAt" | "seating" | "bookingTypes"
> {
  scheduleServiceId: string;
  name: string;
}

export interface ResolvedDay {
  serviceDate: ServiceDate;
  /** The schedule in force; `null` when no assignment covers the date (closed). */
  scheduleId: string | null;
  /** In opening order. */
  services: ResolvedService[];
}

function coversDate(assignment: ScheduleAssignment, serviceDate: ServiceDate): boolean {
  // "YYYY-MM-DD" strings order chronologically; open ends are unbounded.
  return (
    assignment.weekdays.includes(weekdayIndexOf(serviceDate)) &&
    (assignment.startsOn == null || assignment.startsOn <= serviceDate) &&
    (assignment.endsOn == null || serviceDate <= assignment.endsOn)
  );
}

/** The covering assignment with the highest precedence; the first listed wins a tie. */
function scheduleFor(config: AvailabilityConfig, serviceDate: ServiceDate): string | null {
  const live = new Set(config.schedules.filter((s) => !s.archivedAt).map((s) => s.id));
  const winner = config.assignments
    .filter((a) => live.has(a.scheduleId) && coversDate(a, serviceDate))
    .reduce<ScheduleAssignment | null>(
      (best, a) => (best === null || a.precedence > best.precedence ? a : best),
      null
    );
  return winner?.scheduleId ?? null;
}

function toResolved(service: ScheduleService, venueService: VenueService): ResolvedService {
  return {
    scheduleServiceId: service.id,
    venueServiceId: service.venueServiceId,
    name: venueService.name,
    opensAt: service.opensAt,
    lastSeatingAt: service.lastSeatingAt,
    closesAt: service.closesAt,
    seating: service.seating,
    bookingTypes: service.bookingTypes,
  };
}

export function resolveDay(snapshot: AvailabilitySnapshot, serviceDate: ServiceDate): ResolvedDay {
  const { config } = snapshot;
  const scheduleId = scheduleFor(config, serviceDate);
  const venueServices = new Map(
    config.venueServices.filter((v) => !v.archivedAt).map((v) => [v.id, v])
  );
  const services = config.scheduleServices
    .filter((s) => s.scheduleId === scheduleId)
    .flatMap((s) => {
      const venueService = venueServices.get(s.venueServiceId);
      return venueService ? [toResolved(s, venueService)] : [];
    })
    .sort((a, b) => a.opensAt - b.opensAt);
  return { serviceDate, scheduleId, services };
}
