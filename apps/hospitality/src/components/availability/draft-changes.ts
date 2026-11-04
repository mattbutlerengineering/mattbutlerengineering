import {
  decodeWeek,
  encodeWeek,
  servicesOn,
  weekdayIndexOf,
  type ResolvedDaySummary,
  type ServiceHours,
  type ServiceWeek,
} from "@mbe/availability";
import type {
  AvailabilityConfig,
  AvailabilityConfigChanges,
  DateRule,
  ScheduleService,
  Seating,
  SpecialHoursService,
} from "@mbe/types";
import { editHoursRule, type SeriesScope, type SpecialHoursRule } from "./series-edit.js";

/**
 * The drawer's draft: the services a Manager is editing and the scope they apply to, and the
 * pure step that turns both into the row operations a config save sends (architecture §
 * Availability API, `PUT …/availability/config`). No I/O and no React, so the three scopes are
 * pinned by `draft-changes.test.ts`.
 */

/** What an edit reaches (ux.md F2, "You're changing"). */
export type EditScope =
  | { readonly kind: "date"; readonly date: string }
  /** Every weekday of `from`, from `from` until `until` (`null`: until changed again). */
  | { readonly kind: "weekday"; readonly from: string; readonly until: string | null }
  | { readonly kind: "schedule"; readonly scheduleId: string }
  /** One weekday of the live regular week, in place: no schedule or assignment is made (ux.md F2 1). */
  | { readonly kind: "regularWeekday"; readonly weekday: number }
  /** Exactly these dates, picked in the multi-select bar (ux.md F-MS). */
  | { readonly kind: "dates"; readonly dates: readonly string[] }
  /** A range or repeating special-hours rule, from `from` on ("following") or whole ("all"). */
  | {
      readonly kind: "rule";
      readonly ruleId: string;
      readonly mode: SeriesScope;
      readonly from: string;
    };

/**
 * The date an overnight close can be named against: only a save that governs exactly one date, or
 * one weekday every time (a regular week, picked dates and a multi-date rule span several), so
 * "the next day (Saturday)" is never said of a close that also lands on other weekdays.
 */
export function overnightHintDate(
  scope: EditScope,
  date: string,
  dates: readonly string[]
): string | undefined {
  if (scope.kind === "date" || scope.kind === "weekday" || scope.kind === "regularWeekday") {
    return date;
  }
  if (scope.kind === "rule" && dates.length === 1) return date;
  return undefined;
}

/** One editable service row. */
export interface DraftService {
  /** React key; stable across edits. */
  readonly key: string;
  /** `null` for a service the venue has not had before; `name` then names it. */
  readonly venueServiceId: string | null;
  /** The stored schedule-service row this edits, in a schedule scope. */
  readonly scheduleServiceId: string | null;
  readonly name: string;
  readonly opensAt: number;
  readonly lastSeatingAt: number;
  readonly closesAt: number;
  readonly seating: Seating;
  readonly bookingTypes: readonly ("online" | "phone")[];
}

type SeedService = Pick<
  DraftService,
  "opensAt" | "lastSeatingAt" | "closesAt" | "seating" | "bookingTypes"
>;

const hoursOf = (s: SeedService): SeedService => ({
  opensAt: s.opensAt,
  lastSeatingAt: s.lastSeatingAt,
  closesAt: s.closesAt,
  seating: s.seating,
  bookingTypes: s.bookingTypes,
});

function hoursRuleOf(config: AvailabilityConfig, ruleId: string): SpecialHoursRule | undefined {
  return config.dateRules.find(
    (r): r is SpecialHoursRule => r.id === ruleId && r.kind === "special_hours"
  );
}

/** The rows the drawer starts from: the day as resolved, or the schedule's own services. */
export function seedServices(
  config: AvailabilityConfig,
  day: Pick<ResolvedDaySummary, "services">,
  scope: EditScope
): DraftService[] {
  const names = new Map(config.venueServices.map((v) => [v.id, v.name]));
  if (scope.kind === "rule") {
    return [...(hoursRuleOf(config, scope.ruleId)?.payload.services ?? [])]
      .sort((a, b) => a.opensAt - b.opensAt)
      .map((s) => ({
        ...hoursOf(s),
        key: s.venueServiceId,
        venueServiceId: s.venueServiceId,
        scheduleServiceId: null,
        name: names.get(s.venueServiceId) ?? s.venueServiceId,
      }));
  }
  if (scope.kind === "regularWeekday") {
    const week = liveRegularWeek(config);
    const venueServices = new Map(config.venueServices.map((v) => [v.id, v]));
    return week
      ? servicesOn(week.rows, venueServices, scope.weekday).map((s) => ({
          ...hoursOf(s),
          key: s.venueServiceId,
          venueServiceId: s.venueServiceId,
          scheduleServiceId: s.scheduleServiceId,
          name: s.name,
        }))
      : [];
  }
  if (scope.kind !== "schedule") {
    return day.services.map((s) => ({
      ...hoursOf(s),
      key: s.venueServiceId,
      venueServiceId: s.venueServiceId,
      scheduleServiceId: null,
      name: s.name,
    }));
  }
  return config.scheduleServices
    .filter((s) => s.scheduleId === scope.scheduleId)
    .sort((a, b) => a.opensAt - b.opensAt)
    .map((s) => ({
      ...hoursOf(s),
      key: s.venueServiceId,
      venueServiceId: s.venueServiceId,
      scheduleServiceId: s.id,
      name: names.get(s.venueServiceId) ?? s.venueServiceId,
    }));
}

const comparable = (services: readonly DraftService[]) =>
  JSON.stringify(services.map((s) => [s.venueServiceId, s.name, hoursOf(s)]));

/** Whether two drafts say the same thing; row keys are bookkeeping and do not count. */
export function servicesEqual(a: readonly DraftService[], b: readonly DraftService[]): boolean {
  return comparable(a) === comparable(b);
}

interface BuildInput {
  readonly config: AvailabilityConfig;
  readonly scope: EditScope;
  readonly services: readonly DraftService[];
  /** Ids for rows this draft creates. */
  readonly makeId: () => string;
  /**
   * Dates left out of a dates save: under "Keep theirs" the ones with their own hours change,
   * since the server treats a changed rule as incoming and would overwrite it.
   */
  readonly leaveOut?: readonly string[];
  /** Today on the venue clock: a rule edit's "All dates" starts here, so past dates keep their hours. */
  readonly today?: string;
  /** The config the draft was seeded from; a schedule save removes only rows it contained. */
  readonly baseline?: AvailabilityConfig;
}

/** The venue's own single-date special-hours rule for `date`, which a date edit changes in place. */
function ownDateRule(config: AvailabilityConfig, date: string): DateRule | undefined {
  return config.dateRules.find(
    (r) =>
      r.kind === "special_hours" &&
      r.targetKind === "venue" &&
      r.startsOn === date &&
      r.endsOn === date &&
      r.repeat == null &&
      r.window == null &&
      r.seriesId == null &&
      r.bookingTypes == null &&
      r.venueServiceId == null
  );
}

function specialHoursRule(base: Partial<DateRule>, id: string, services: SpecialHoursService[]) {
  return {
    ...base,
    id,
    kind: "special_hours",
    targetKind: "venue",
    startsOn: base.startsOn ?? "",
    payload: { version: 1, services },
  } as DateRule;
}

/** One single-date special-hours rule for `date`, reusing the date's own rule when it has one. */
function dateRule(
  config: AvailabilityConfig,
  date: string,
  services: SpecialHoursService[],
  makeId: () => string
): DateRule {
  const own = ownDateRule(config, date);
  return specialHoursRule(own ?? { startsOn: date, endsOn: date }, own?.id ?? makeId(), services);
}

function scheduleServiceRows(
  config: AvailabilityConfig,
  scheduleId: string,
  services: readonly (DraftService & { venueServiceId: string })[],
  makeId: () => string,
  baseline?: AvailabilityConfig
): { upsert: ScheduleService[]; removed: string[] } {
  const stored = config.scheduleServices.filter((s) => s.scheduleId === scheduleId);
  const kept = new Set(services.map((s) => s.venueServiceId));
  // Only rows the draft started with can be ones the Manager removed. A row that appeared since
  // (a colleague's new service) was never in front of them, so a save must not delete it.
  const seen = baseline && new Set(baseline.scheduleServices.map((s) => s.id));
  return {
    upsert: services.map((s) => {
      const id =
        s.scheduleServiceId ??
        stored.find((row) => row.venueServiceId === s.venueServiceId)?.id ??
        makeId();
      // These rows carry a service's base hours only: its own days and different hours stay as stored.
      const was = stored.find((row) => row.id === id);
      return {
        ...hoursOf(s),
        bookingTypes: [...s.bookingTypes],
        weekdays: was?.weekdays ?? [],
        dayHours: was?.dayHours ?? { version: 1 as const, sets: [] },
        id,
        scheduleId,
        venueServiceId: s.venueServiceId,
      };
    }),
    removed: stored
      .filter((s) => !kept.has(s.venueServiceId) && (!seen || seen.has(s.id)))
      .map((s) => s.id),
  };
}

/** The live regular week: its schedule, that schedule's rows, and the weekdays its assignments cover. */
function liveRegularWeek(config: AvailabilityConfig) {
  const schedule = config.schedules.find((s) => s.isRegular && !s.archivedAt);
  if (!schedule) return null;
  return {
    schedule,
    rows: config.scheduleServices.filter((s) => s.scheduleId === schedule.id),
    covered: [
      ...new Set(
        config.assignments.filter((a) => a.scheduleId === schedule.id).flatMap((a) => a.weekdays)
      ),
    ],
  };
}

const rowKey = (row: Pick<ScheduleService, "weekdays" | "dayHours" | keyof ServiceHours>) =>
  JSON.stringify([
    row.opensAt,
    row.lastSeatingAt,
    row.closesAt,
    row.seating,
    row.bookingTypes,
    row.weekdays,
    row.dayHours,
  ]);

/**
 * ux.md F2 1: one weekday of the regular week, in place. The week is decoded, that weekday's
 * services replaced by the draft's, and encoded again; only the rows the encoding changes are
 * written, and a service that now runs on no day loses its row. No schedule or assignment is made.
 */
function regularWeekdayRows(
  config: AvailabilityConfig,
  weekday: number,
  services: readonly (DraftService & { venueServiceId: string })[],
  makeId: () => string
): { upsert: ScheduleService[]; removed: string[] } {
  const week = liveRegularWeek(config);
  if (!week) return { upsert: [], removed: [] };
  const edited = new Map(services.map((s) => [s.venueServiceId, s]));
  const hoursFor = (s: DraftService): ServiceHours => ({
    ...hoursOf(s),
    bookingTypes: [...s.bookingTypes],
  });
  const decoded = decodeWeek(week.rows, week.covered);
  const replaced: ServiceWeek[] = [
    ...decoded.map((service) => {
      const mine = edited.get(service.venueServiceId);
      return {
        venueServiceId: service.venueServiceId,
        days: service.days.map((hours, day) =>
          day === weekday ? (mine ? hoursFor(mine) : null) : hours
        ),
      };
    }),
    ...services
      .filter((s) => !decoded.some((d) => d.venueServiceId === s.venueServiceId))
      .map((s) => ({
        venueServiceId: s.venueServiceId,
        days: Array.from({ length: 7 }, (_, day) => (day === weekday ? hoursFor(s) : null)),
      })),
  ];
  const encoded = encodeWeek(replaced, week.covered);
  const stored = new Map(week.rows.map((row) => [row.venueServiceId, row]));
  return {
    upsert: encoded.flatMap((row): ScheduleService[] => {
      const was = stored.get(row.venueServiceId);
      if (was && rowKey(was) === rowKey(row)) return [];
      return [{ ...row, id: was?.id ?? makeId(), scheduleId: week.schedule.id }];
    }),
    removed: week.rows
      .filter((row) => !encoded.some((e) => e.venueServiceId === row.venueServiceId))
      .map((row) => row.id),
  };
}
/** The row operations a save of this draft sends. Rows are only listed when there is something in them. */
export function buildDraftChanges(input: BuildInput): AvailabilityConfigChanges {
  const { config, scope, makeId } = input;
  const nextPosition = Math.max(-1, ...config.venueServices.map((v) => v.position)) + 1;
  const created = input.services
    .filter((s) => s.venueServiceId === null)
    .map((s, i) => ({ id: makeId(), name: s.name, position: nextPosition + i }));
  let createdAt = 0;
  const services = input.services.map((s) => ({
    ...s,
    venueServiceId: s.venueServiceId ?? created[createdAt++]!.id,
  }));
  const venueServices = created.length > 0 ? { venueServices: created } : {};

  if (scope.kind === "regularWeekday") {
    const { upsert, removed } = regularWeekdayRows(config, scope.weekday, services, makeId);
    return {
      upsert: { ...venueServices, ...(upsert.length > 0 ? { scheduleServices: upsert } : {}) },
      remove: removed.length > 0 ? { scheduleServices: removed } : {},
    };
  }
  if (scope.kind === "schedule") {
    const { upsert, removed } = scheduleServiceRows(
      config,
      scope.scheduleId,
      services,
      makeId,
      input.baseline
    );
    return {
      upsert: { ...venueServices, scheduleServices: upsert },
      remove: removed.length > 0 ? { scheduleServices: removed } : {},
    };
  }

  const payload: SpecialHoursService[] = services.map((s) => ({
    ...hoursOf(s),
    bookingTypes: [...s.bookingTypes],
    venueServiceId: s.venueServiceId,
  }));
  if (scope.kind === "rule") {
    const rule = hoursRuleOf(config, scope.ruleId);
    if (!rule) return { upsert: venueServices, remove: {} };
    const changes = editHoursRule(
      rule,
      scope.mode,
      scope.from,
      { version: 1, services: payload },
      makeId,
      input.today
    );
    return { upsert: { ...venueServices, ...changes.upsert }, remove: {} };
  }
  if (scope.kind === "dates" || scope.kind === "date") {
    const picked = scope.kind === "date" ? [scope.date] : scope.dates;
    const skipped = new Set(input.leaveOut ?? []);
    const singles = picked.filter((d) => !skipped.has(d));
    const dateRules = singles.map((d) => dateRule(config, d, payload, makeId));
    return { upsert: { ...venueServices, dateRules }, remove: {} };
  }
  // A rule from a past day would rewrite hours that already happened: start it today instead.
  const startsOn = input.today !== undefined && input.today > scope.from ? input.today : scope.from;
  const rule = specialHoursRule(
    {
      startsOn,
      endsOn: scope.until,
      repeat: { version: 1, weekdays: [weekdayIndexOf(scope.from)] },
    },
    makeId(),
    payload
  );
  return { upsert: { ...venueServices, dateRules: [rule] }, remove: {} };
}
