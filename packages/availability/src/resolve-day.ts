import type {
  AvailabilityConfig,
  DateRule,
  ScheduleAssignment,
  ScheduleService,
  SpecialHoursService,
  VenueService,
} from "@mbe/types";
import { weekdayIndexOf } from "./civil-date.js";
import {
  WHOLE_DAY,
  activeRules,
  hoursEffect,
  ofKind,
  seriesLabel,
  targetLabel,
  tonightEffect,
  windowEffect,
  type RuleOf,
} from "./date-rules.js";
import type { ServiceDate } from "./types.js";

/**
 * Resolves the layer stack for one service day (ADR-030), bottom-up:
 * schedule assignment → use_schedule → special_hours → skips → closures →
 * Tonight. A service belongs to the service day it opens on, so a service
 * that runs past midnight is part of its start day and never of the next
 * calendar date (ADR-029).
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
  /** `null` for a service from special hours. */
  scheduleServiceId: string | null;
  name: string;
}

/** A closed band of the service day, in minutes; a whole-day closure is 0–2880. */
export interface ResolvedClosure {
  ruleId: string;
  targetKind: DateRule["targetKind"];
  venueServiceId?: string;
  tableIds?: string[];
  bookingTypes?: NonNullable<DateRule["bookingTypes"]>;
  from: number;
  to: number;
}

export type BookingOpen = Record<"online" | "phone" | "waitlist", boolean>;

export type LayerKind = "schedule" | DateRule["kind"];

/** One entry of "Why this day". */
export interface Layer {
  kind: LayerKind;
  /** The assignment or date rule row. */
  id: string;
  label: string;
  effect: string;
  /** The day as it would resolve with this row removed. */
  removalResult: ResolvedDaySummary;
}

export interface ResolvedDaySummary {
  serviceDate: ServiceDate;
  /** The schedule in force; `null` when no assignment covers the date. */
  scheduleId: string | null;
  /** In opening order. */
  services: ResolvedService[];
  closures: ResolvedClosure[];
  bookingOpen: BookingOpen;
  /** Tonight's lowered pacing, in covers per seating interval. */
  pacingCovers?: number;
  guestMessage?: string;
}

export interface ResolvedDay extends ResolvedDaySummary {
  /** Contributing layers, bottom-up. */
  explanation: Layer[];
}

type PendingLayer = Omit<Layer, "removalResult">;

interface Resolution {
  day: ResolvedDaySummary;
  layers: PendingLayer[];
}

const ALL_OPEN: BookingOpen = { online: true, phone: true, waitlist: true };

function coversDate(assignment: ScheduleAssignment, serviceDate: ServiceDate): boolean {
  // "YYYY-MM-DD" strings order chronologically; open ends are unbounded.
  return (
    assignment.weekdays.includes(weekdayIndexOf(serviceDate)) &&
    (assignment.startsOn == null || assignment.startsOn <= serviceDate) &&
    (assignment.endsOn == null || serviceDate <= assignment.endsOn)
  );
}

/** The covering assignment with the highest precedence; the first listed wins a tie. */
function assignmentFor(
  config: AvailabilityConfig,
  serviceDate: ServiceDate
): ScheduleAssignment | null {
  const live = new Set(config.schedules.filter((s) => !s.archivedAt).map((s) => s.id));
  return config.assignments
    .filter((a) => live.has(a.scheduleId) && coversDate(a, serviceDate))
    .reduce<ScheduleAssignment | null>(
      (best, a) => (best === null || a.precedence > best.precedence ? a : best),
      null
    );
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

function liveServices(
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

function closureOf(rule: DateRule, band: { from: number; to: number }): ResolvedClosure {
  return {
    ruleId: rule.id,
    targetKind: rule.targetKind,
    ...(rule.targetKind === "service" && rule.venueServiceId
      ? { venueServiceId: rule.venueServiceId }
      : {}),
    ...(rule.targetKind === "tables" && rule.tableIds ? { tableIds: rule.tableIds } : {}),
    ...(rule.targetKind === "booking" && rule.bookingTypes
      ? { bookingTypes: rule.bookingTypes }
      : {}),
    from: band.from,
    to: band.to,
  };
}

function closeBookingTypes(open: BookingOpen, rule: DateRule): BookingOpen {
  const closed = rule.bookingTypes ?? [];
  return {
    online: open.online && !closed.includes("online"),
    phone: open.phone && !closed.includes("phone"),
    waitlist: open.waitlist && !closed.includes("waitlist"),
  };
}

/** A whole-day closure takes services or booking types away; a windowed one only records its band. */
function applyClosure(day: ResolvedDaySummary, rule: RuleOf<"closure">): ResolvedDaySummary {
  const closures = [...day.closures, closureOf(rule, rule.window ?? WHOLE_DAY)];
  if (rule.window) return { ...day, closures };
  switch (rule.targetKind) {
    case "venue":
      return { ...day, closures, services: [] };
    case "service":
      return {
        ...day,
        closures,
        services: day.services.filter((s) => s.venueServiceId !== rule.venueServiceId),
      };
    case "booking":
      return { ...day, closures, bookingOpen: closeBookingTypes(day.bookingOpen, rule) };
    case "tables":
      return { ...day, closures };
  }
}

function closeEarly(service: ResolvedService, closeAt: number): ResolvedService[] {
  if (service.opensAt >= closeAt) return [];
  return [
    {
      ...service,
      lastSeatingAt: Math.min(service.lastSeatingAt, closeAt),
      closesAt: Math.min(service.closesAt, closeAt),
    },
  ];
}

function applyTonight(day: ResolvedDaySummary, rule: RuleOf<"tonight">): ResolvedDaySummary {
  const { payload } = rule;
  if ("closeAt" in payload) {
    // Closing early is about services: a venue rule closes them all, a service
    // rule closes its own, and booking or table targets have no hours to cut.
    if (rule.targetKind !== "venue" && rule.targetKind !== "service") return day;
    const targeted = (s: ResolvedService) =>
      rule.targetKind === "venue" || s.venueServiceId === rule.venueServiceId;
    return {
      ...day,
      services: day.services.flatMap((s) => (targeted(s) ? closeEarly(s, payload.closeAt) : [s])),
    };
  }
  if ("stop" in payload) {
    const closures = [...day.closures, closureOf(rule, payload.stop)];
    // A whole-day booking stop (Pause online) turns those channels off; a windowed one only records its band.
    const wholeDay = payload.stop.from === 0 && payload.stop.to >= WHOLE_DAY.to;
    return rule.targetKind === "booking" && wholeDay
      ? { ...day, closures, bookingOpen: closeBookingTypes(day.bookingOpen, rule) }
      : { ...day, closures };
  }
  return {
    ...day,
    pacingCovers: Math.min(day.pacingCovers ?? Infinity, payload.pacing.covers),
  };
}

function withMessage(day: ResolvedDaySummary, rule: DateRule): ResolvedDaySummary {
  return rule.guestMessage ? { ...day, guestMessage: rule.guestMessage } : day;
}

function resolveLayers(config: AvailabilityConfig, serviceDate: ServiceDate): Resolution {
  const schedules = new Map(config.schedules.map((s) => [s.id, s]));
  const venueServices = new Map(
    config.venueServices.filter((v) => !v.archivedAt).map((v) => [v.id, v])
  );
  const rules = activeRules(config.dateRules, serviceDate);
  const servicesOf = (scheduleId: string | null) =>
    liveServices(
      config.scheduleServices.filter((s) => s.scheduleId === scheduleId),
      venueServices
    );
  const skippedLabel = (skip: DateRule) => {
    const series = config.dateRules.find((r) => r.id === skip.seriesId);
    return series ? `Skipped from: ${seriesLabel(series, serviceName(series))}` : "Skipped date";
  };
  const scheduleName = (id: string) => schedules.get(id)?.name ?? "Schedule";

  const assignment = assignmentFor(config, serviceDate);
  const useSchedule = ofKind(rules, "use_schedule")
    .filter((r) => schedules.get(r.useScheduleId)?.archivedAt == null)
    .at(-1);
  const scheduleId = useSchedule?.useScheduleId ?? assignment?.scheduleId ?? null;
  const special = ofKind(rules, "special_hours").at(-1);
  const services = special
    ? liveServices(special.payload.services, venueServices)
    : servicesOf(scheduleId);
  const closures = ofKind(rules, "closure");
  const tonights = ofKind(rules, "tonight");
  const serviceName = (rule: DateRule) =>
    rule.venueServiceId ? venueServices.get(rule.venueServiceId)?.name : undefined;

  const base: ResolvedDaySummary = {
    serviceDate,
    scheduleId,
    services,
    closures: [],
    bookingOpen: ALL_OPEN,
  };
  const afterClosures = closures.reduce(
    (day, rule) => withMessage(applyClosure(day, rule), rule),
    special ? withMessage(base, special) : base
  );
  const day = tonights.reduce((d, rule) => withMessage(applyTonight(d, rule), rule), afterClosures);

  const layers: PendingLayer[] = [
    ...(assignment
      ? [
          {
            kind: "schedule" as const,
            id: assignment.id,
            label: scheduleName(assignment.scheduleId),
            effect: hoursEffect(servicesOf(assignment.scheduleId)),
          },
        ]
      : []),
    ...(useSchedule
      ? [
          {
            kind: "use_schedule" as const,
            id: useSchedule.id,
            label: `Use ${scheduleName(useSchedule.useScheduleId)}`,
            effect: hoursEffect(servicesOf(useSchedule.useScheduleId)),
          },
        ]
      : []),
    ...(special
      ? [
          {
            kind: "special_hours" as const,
            id: special.id,
            label: "Special hours",
            effect: hoursEffect(services),
          },
        ]
      : []),
    ...ofKind(rules, "skip").map((r) => ({
      kind: "skip" as const,
      id: r.id,
      label: skippedLabel(r),
      effect: "Bookable as usual",
    })),
    ...closures.map((r) => ({
      kind: "closure" as const,
      id: r.id,
      label: targetLabel(r, serviceName(r)),
      effect: windowEffect(r),
    })),
    ...tonights.map((r) => ({
      kind: "tonight" as const,
      id: r.id,
      label: "Tonight",
      effect: tonightEffect(r),
    })),
  ];

  return { day, layers };
}

function withoutRow(config: AvailabilityConfig, id: string): AvailabilityConfig {
  return {
    ...config,
    assignments: config.assignments.filter((a) => a.id !== id),
    dateRules: config.dateRules.filter((r) => r.id !== id),
  };
}

export function resolveDay(snapshot: AvailabilitySnapshot, serviceDate: ServiceDate): ResolvedDay {
  const { config } = snapshot;
  const { day, layers } = resolveLayers(config, serviceDate);
  return {
    ...day,
    explanation: layers.map((layer) => ({
      ...layer,
      removalResult: resolveLayers(withoutRow(config, layer.id), serviceDate).day,
    })),
  };
}
