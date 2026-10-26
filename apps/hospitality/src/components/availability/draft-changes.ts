import { weekdayIndexOf, type ResolvedDaySummary } from "@mbe/availability";
import type {
  AvailabilityConfig,
  AvailabilityConfigChanges,
  DateRule,
  ScheduleService,
  Seating,
  SpecialHoursService,
} from "@mbe/types";

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
  /** Exactly these dates, picked in the multi-select bar (ux.md F-MS). */
  | { readonly kind: "dates"; readonly dates: readonly string[] };

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

/** The rows the drawer starts from: the day as resolved, or the schedule's own services. */
export function seedServices(
  config: AvailabilityConfig,
  day: Pick<ResolvedDaySummary, "services">,
  scope: EditScope
): DraftService[] {
  if (scope.kind !== "schedule") {
    return day.services.map((s) => ({
      ...hoursOf(s),
      key: s.venueServiceId,
      venueServiceId: s.venueServiceId,
      scheduleServiceId: null,
      name: s.name,
    }));
  }
  const names = new Map(config.venueServices.map((v) => [v.id, v.name]));
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
  makeId: () => string
): { upsert: ScheduleService[]; removed: string[] } {
  const stored = config.scheduleServices.filter((s) => s.scheduleId === scheduleId);
  const kept = new Set(services.map((s) => s.venueServiceId));
  return {
    upsert: services.map((s) => ({
      ...hoursOf(s),
      bookingTypes: [...s.bookingTypes],
      id:
        s.scheduleServiceId ??
        stored.find((row) => row.venueServiceId === s.venueServiceId)?.id ??
        makeId(),
      scheduleId,
      venueServiceId: s.venueServiceId,
    })),
    removed: stored.filter((s) => !kept.has(s.venueServiceId)).map((s) => s.id),
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

  if (scope.kind === "schedule") {
    const { upsert, removed } = scheduleServiceRows(config, scope.scheduleId, services, makeId);
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
  if (scope.kind === "dates" || scope.kind === "date") {
    const singles = scope.kind === "date" ? [scope.date] : scope.dates;
    const dateRules = singles.map((d) => dateRule(config, d, payload, makeId));
    return { upsert: { ...venueServices, dateRules }, remove: {} };
  }
  const rule = specialHoursRule(
    {
      startsOn: scope.from,
      endsOn: scope.until,
      repeat: { version: 1, weekdays: [weekdayIndexOf(scope.from)] },
    },
    makeId(),
    payload
  );
  return { upsert: { ...venueServices, dateRules: [rule] }, remove: {} };
}
