import { addDays, weekdayIndexOf } from "@mbe/availability";
import type {
  AvailabilityConfig,
  AvailabilityConfigChanges,
  Schedule,
  ScheduleAssignment,
} from "@mbe/types";
import { buildDraftChanges, type DraftService } from "./draft-changes.js";
import { draftToConfig, type QuickSetupDraft } from "./quick-setup-draft.js";
import { SCOPE_HORIZON_DAYS } from "./scope-dates.js";

/**
 * The Schedules tab's row operations (ux.md F3, F-UW): new, duplicate, edit, delete, and the
 * dated "Change regular week". Pure, no React. Where two dated schedules cover the same day the
 * Manager picks the winner; it is stored as `precedence`, renumbered so no two meeting
 * assignments ever tie (`validateConfig`'s `precedence_tie`).
 */

/** Where a schedule applies: weekdays (0 = Sunday), and an optional date range. */
export interface UseOn {
  readonly weekdays: readonly number[];
  readonly startsOn?: string | null;
  readonly endsOn?: string | null;
}

/** Who wins where the new use meets another schedule's. */
export type Winner = "new" | "existing";

/** Monday-first display order of the stored weekday indexes. */
const MONDAY_FIRST: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

/** Consecutive weekdays as `[first, last]` pairs, Monday first ("Mon–Thu", "Sat–Sun"). */
export function weekdayRuns(weekdays: readonly number[]): [number, number][] {
  const positions = MONDAY_FIRST.flatMap((d, i) => (weekdays.includes(d) ? [i] : []));
  const runs: [number, number][] = [];
  let start = -1;
  positions.forEach((p, i) => {
    if (start < 0) start = p;
    if (positions[i + 1] !== p + 1) {
      runs.push([MONDAY_FIRST[start]!, MONDAY_FIRST[p]!]);
      start = -1;
    }
  });
  return runs;
}

const liveSchedules = (config: AvailabilityConfig): Schedule[] =>
  config.schedules.filter((s) => !s.archivedAt);

/** A schedule can be deleted only when nothing assigns it and no date rule points at it. */
export function isScheduleUnused(config: AvailabilityConfig, scheduleId: string): boolean {
  const schedule = config.schedules.find((s) => s.id === scheduleId);
  if (!schedule || schedule.isRegular) return false;
  return (
    !config.assignments.some((a) => a.scheduleId === scheduleId) &&
    !config.dateRules.some((r) => r.kind === "use_schedule" && r.useScheduleId === scheduleId)
  );
}

export function buildDeleteScheduleChanges(scheduleId: string): AvailabilityConfigChanges {
  return { upsert: {}, remove: { schedules: [scheduleId] } };
}

/** What stops a schedule draft being saved; `availabilitySchedules.blocked.<code>` says it. */
export type ScheduleSaveBlock =
  | "conflict"
  | "startRequired"
  | "endBeforeStart"
  | "nameRequired"
  | "servicesRequired"
  | "serviceNameRequired";

/** The first problem, in form order, or `null` when the draft can be saved. */
export function scheduleSaveBlock(draft: {
  readonly conflicted: boolean;
  readonly name: string;
  readonly services: readonly DraftService[];
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly startRequired?: boolean;
}): ScheduleSaveBlock | null {
  const { startsOn, endsOn, services } = draft;
  if (draft.conflicted) return "conflict";
  if (draft.startRequired && !startsOn) return "startRequired";
  if (startsOn && endsOn && endsOn < startsOn) return "endBeforeStart";
  if (draft.name.trim() === "") return "nameRequired";
  if (services.length === 0) return "servicesRequired";
  if (services.some((s) => s.venueServiceId === null && !s.name.trim())) {
    return "serviceNameRequired";
  }
  return null;
}

/** Do the two uses cover at least one common date? */
function meets(a: UseOn, b: UseOn): boolean {
  const shared = a.weekdays.filter((d) => b.weekdays.includes(d));
  if (shared.length === 0) return false;
  const from = [a.startsOn, b.startsOn]
    .filter((d): d is string => d != null)
    .sort()
    .at(-1);
  const to = [a.endsOn, b.endsOn].filter((d): d is string => d != null).sort()[0];
  if (from == null && to == null) return true;
  if (from != null && to != null && from > to) return false;
  // Open ends are unbounded; a week of the common range holds every weekday it can.
  const lo = from ?? addDays(to!, -6);
  const hi = to ?? addDays(from!, 6);
  for (let d = lo, n = 0; d <= hi && n < 7; d = addDays(d, 1), n += 1) {
    if (shared.includes(weekdayIndexOf(d))) return true;
  }
  return false;
}

/** Live assignments of schedules that are not the regular week, lowest precedence first. */
function rankedAssignments(
  config: AvailabilityConfig,
  ignoreScheduleId?: string
): ScheduleAssignment[] {
  const live = new Set(
    liveSchedules(config)
      .filter((s) => !s.isRegular)
      .map((s) => s.id)
  );
  return config.assignments
    .filter((a) => live.has(a.scheduleId) && a.scheduleId !== ignoreScheduleId)
    .sort((a, b) => a.precedence - b.precedence);
}

/** The other dated schedules a use runs into. The regular week always gives way, so it is no choice. */
export function overlappingSchedules(
  config: AvailabilityConfig,
  useOn: UseOn,
  ignoreScheduleId?: string
): Schedule[] {
  const ids = new Set(
    rankedAssignments(config, ignoreScheduleId)
      .filter((a) => meets(a, useOn))
      .map((a) => a.scheduleId)
  );
  return liveSchedules(config).filter((s) => ids.has(s.id));
}

/** The new assignment slotted into the ranking, plus the existing ones whose rank moved. */
function placeAssignment(
  config: AvailabilityConfig,
  mine: ScheduleAssignment,
  winner: Winner
): ScheduleAssignment[] {
  const existing = rankedAssignments(config);
  const lowestMeeting = existing.findIndex((a) => meets(a, mine));
  const at = winner === "existing" && lowestMeeting >= 0 ? lowestMeeting : existing.length;
  const order = [...existing.slice(0, at), mine, ...existing.slice(at)];
  return order
    .map((a, i) => ({ ...a, precedence: i + 1 }))
    .filter(
      (a) =>
        a.id === mine.id ||
        a.precedence !== config.assignments.find((x) => x.id === a.id)?.precedence
    );
}

function mergeChanges(
  a: AvailabilityConfigChanges,
  b: AvailabilityConfigChanges
): AvailabilityConfigChanges {
  const tables = [
    "schedules",
    "venueServices",
    "scheduleServices",
    "assignments",
    "dateRules",
  ] as const;
  const join = <T>(x: T[] | undefined, y: T[] | undefined) => [...(x ?? []), ...(y ?? [])];
  const pick = <K extends "upsert" | "remove">(side: K) =>
    Object.fromEntries(
      tables.flatMap((t) => {
        const rows = join<unknown>(
          (a[side] as Record<string, unknown[] | undefined>)[t],
          (b[side] as Record<string, unknown[] | undefined>)[t]
        );
        return rows.length > 0 ? [[t, rows]] : [];
      })
    );
  return { upsert: pick("upsert"), remove: pick("remove") } as AvailabilityConfigChanges;
}

interface NewScheduleInput {
  readonly config: AvailabilityConfig;
  readonly name: string;
  /** Rows for the new schedule; a copy's rows must have `scheduleServiceId: null`. */
  readonly services: readonly DraftService[];
  readonly useOn: UseOn;
  readonly winner: Winner;
  readonly makeId: () => string;
}

/** A new alternate schedule with its services, assigned where `useOn` says (nowhere if no weekday). */
export function buildNewScheduleChanges(input: NewScheduleInput): AvailabilityConfigChanges {
  const { config, name, useOn, winner, makeId } = input;
  const scheduleId = makeId();
  const schedule: Schedule = { id: scheduleId, name, kind: "alternate", isRegular: false };
  const rows = buildDraftChanges({
    config,
    scope: { kind: "schedule", scheduleId },
    services: freshRows(input.services),
    makeId,
  });
  const assignments =
    useOn.weekdays.length === 0
      ? []
      : placeAssignment(
          config,
          {
            id: makeId(),
            scheduleId,
            weekdays: [...useOn.weekdays].sort((x, y) => x - y),
            startsOn: useOn.startsOn ?? null,
            endsOn: useOn.endsOn ?? null,
            precedence: 0,
          },
          winner
        );
  return mergeChanges(rows, {
    upsert: { schedules: [schedule], ...(assignments.length > 0 ? { assignments } : {}) },
    remove: {},
  });
}

interface RegularWeekInput {
  readonly config: AvailabilityConfig;
  /** The period's name; a change with no end is the regular week itself and is named by nothing. */
  readonly name: string;
  /** The week as the editor holds it: services with their days and different-hours blocks. */
  readonly draft: QuickSetupDraft;
  readonly startsOn: string;
  readonly endsOn: string | null;
  readonly winner: Winner;
  readonly makeId: () => string;
}

/**
 * F-UW. The draft is encoded into one regular schedule's rows (`draftToConfig`) and its one
 * assignment covers the union of the days any service runs, so the days follow the editor: a
 * closed weekday can be opened, and one no service runs on loses its hours. With an end date the
 * period is a dated schedule and the regular week returns by itself after it, other days keeping
 * their hours. With none the new week takes over as the regular week from the start date: it is
 * named "Regular week", the old assignments end the day before, and the superseded schedule stays
 * `kind: "regular"` (it is still part of the regular week, so nothing new appears on Schedules).
 */
export function buildRegularWeekChanges(input: RegularWeekInput): AvailabilityConfigChanges {
  const { config, draft, startsOn, endsOn, makeId } = input;
  const venueServiceIds = Object.fromEntries(
    config.venueServices.filter((s) => !s.archivedAt).map((s) => [s.name.toLowerCase(), s.id])
  );
  const week = draftToConfig(draft, makeId, { venueServiceIds });
  const storedServiceIds = new Set(config.venueServices.map((s) => s.id));
  const created = week.venueServices.filter((s) => !storedServiceIds.has(s.id));
  const [built] = week.schedules;
  const [covering] = week.assignments;
  if (!built || !covering) return { upsert: {}, remove: {} };
  // The week editor has no controls for seating or booking types, so a service keeps the ones its
  // regular-week row had (a service it never had gets quick setup's defaults).
  const live = liveSchedules(config).find((s) => s.isRegular);
  const was = new Map(
    config.scheduleServices
      .filter((s) => s.scheduleId === live?.id)
      .map((s) => [s.venueServiceId, s])
  );
  const scheduleServices = week.scheduleServices.map((row) => {
    const stored = was.get(row.venueServiceId);
    if (!stored) return row;
    const { seating, bookingTypes } = stored;
    const sets = row.dayHours.sets.map((set) => ({ ...set, seating, bookingTypes }));
    return { ...row, seating, bookingTypes, dayHours: { ...row.dayHours, sets } };
  });
  const rows = {
    upsert: {
      ...(created.length > 0 ? { venueServices: created } : {}),
      scheduleServices,
    },
    remove: {},
  };

  if (endsOn !== null) {
    const schedule: Schedule = { ...built, name: input.name, kind: "alternate", isRegular: false };
    const assignments = placeAssignment(config, { ...covering, startsOn, endsOn }, input.winner);
    return mergeChanges(rows, { upsert: { schedules: [schedule], assignments }, remove: {} });
  }

  const oldAssignments = config.assignments.filter((a) => a.scheduleId === live?.id);
  const dropped = oldAssignments.filter((a) => a.startsOn != null && a.startsOn >= startsOn);
  const truncated = oldAssignments
    .filter((a) => !dropped.includes(a) && (a.endsOn == null || a.endsOn >= startsOn))
    .map((a) => ({ ...a, endsOn: addDays(startsOn, -1) }));
  // The new week sits at 0, so every dated schedule must rank above it to keep winning its days
  // (legacy venues store every assignment at 0, which would tie).
  const renumbered = rankedAssignments(config)
    .map((a, i) => ({ ...a, precedence: i + 1 }))
    .filter((a) => a.precedence !== config.assignments.find((x) => x.id === a.id)?.precedence);
  return mergeChanges(rows, {
    upsert: {
      schedules: [built, ...(live ? [{ ...live, isRegular: false }] : [])],
      assignments: [{ ...covering, startsOn, endsOn: null }, ...truncated, ...renumbered],
    },
    remove: { assignments: dropped.map((a) => a.id) },
  });
}

/** Rename and re-time one schedule; where it is used is left alone. */
export function buildEditScheduleChanges(input: {
  readonly config: AvailabilityConfig;
  readonly scheduleId: string;
  readonly name: string;
  readonly services: readonly DraftService[];
  readonly makeId: () => string;
  /** The config the drawer was seeded from, so a save removes only rows the Manager saw. */
  readonly baseline: AvailabilityConfig;
}): AvailabilityConfigChanges {
  const { config, scheduleId, name, makeId } = input;
  const rows = buildDraftChanges({
    config,
    scope: { kind: "schedule", scheduleId },
    services: input.services,
    makeId,
    baseline: input.baseline,
  });
  const stored = config.schedules.find((s) => s.id === scheduleId);
  const rename = stored && stored.name !== name ? { schedules: [{ ...stored, name }] } : {};
  return mergeChanges(rows, { upsert: rename, remove: {} });
}

/** A new schedule gets rows of its own; rows seeded from another schedule must not overwrite it. */
function freshRows(services: readonly DraftService[]): DraftService[] {
  return services.map((s) => ({ ...s, scheduleServiceId: null }));
}

/** The future service dates a use covers (today onward, one year at most). */
export function datesOfUse(useOn: UseOn, today: string): string[] {
  const dates: string[] = [];
  for (let i = 0; i < SCOPE_HORIZON_DAYS; i += 1) {
    const d = addDays(today, i);
    if (useOn.endsOn != null && d > useOn.endsOn) break;
    if (
      (useOn.startsOn == null || d >= useOn.startsOn) &&
      useOn.weekdays.includes(weekdayIndexOf(d))
    ) {
      dates.push(d);
    }
  }
  return dates;
}
