import { addDays, applyChanges, resolveDay, weekdayIndexOf } from "@mbe/availability";
import type { ResolvedDay } from "@mbe/availability";
import type { AvailabilityConfig, AvailabilityConfigChanges } from "@mbe/types";
import { buildDraftChanges, seedServices } from "./draft-changes.js";
import { closedAllDay } from "./closed-all-day.js";
import { draftFromConfig, type QuickSetupDraft } from "./quick-setup-draft.js";

/** Copy a day to other days (ux.md F2): the pure parts, so the dialog only lays them out. */

type Service = ResolvedDay["services"][number];

const serviceKey = (s: Service): string =>
  `${s.venueServiceId}|${s.opensAt}|${s.lastSeatingAt}|${s.closesAt}`;

/**
 * Whether two days run the same services at the same times and last seatings, in any order.
 * Seating and booking types are not compared (PRD 8 names services, times and last seating), so a
 * day that differs only there counts as the same and is skipped, not rewritten.
 */
export function sameHoursAs(source: ResolvedDay, target: ResolvedDay): boolean {
  const keys = (day: ResolvedDay) => day.services.map(serviceKey).sort();
  const a = keys(source);
  const b = keys(target);
  return a.length === b.length && a.every((key, i) => key === b[i]);
}

/**
 * The dates "Just this week" reaches: the chosen weekdays inside the copied date's
 * Monday-to-Sunday week, never its own weekday, and none before today (their weekdays come back
 * in `past`, so the dialog can say so).
 */
export function thisWeekTargets(input: {
  readonly date: string;
  readonly weekdays: readonly number[];
  readonly today: string;
}): { dates: string[]; past: number[] } {
  const { date, weekdays, today } = input;
  const monday = addDays(date, -((weekdayIndexOf(date) + 6) % 7));
  const dates: string[] = [];
  const past: number[] = [];
  for (let i = 0; i < 7; i += 1) {
    const day = addDays(monday, i);
    const weekday = weekdayIndexOf(day);
    if (day === date || !weekdays.includes(weekday)) continue;
    if (day < today) past.push(weekday);
    else dates.push(day);
  }
  return { dates, past };
}

/** One single-date special-hours rule per date, carrying the copied day's hours; no repeat. */
export function buildCopySingleDates(input: {
  readonly config: AvailabilityConfig;
  readonly source: ResolvedDay;
  readonly date: string;
  readonly dates: readonly string[];
  readonly makeId: () => string;
}): AvailabilityConfigChanges {
  const { config, source, date, dates, makeId } = input;
  return buildDraftChanges({
    config,
    scope: { kind: "dates", dates },
    services: seedServices(config, source, { kind: "date", date }),
    makeId,
  });
}

/**
 * Each date sorted by what copying would do: `closed` when a whole-day venue closure keeps it
 * shut (special hours written under it would not show), `same` when it already has the copied
 * day's hours, else `changed`. Dates stay in the order given.
 */
export function splitCopyTargets(
  config: AvailabilityConfig,
  timezone: string,
  source: ResolvedDay,
  dates: readonly string[]
): { changed: string[]; same: string[]; closed: string[] } {
  const result = { changed: [] as string[], same: [] as string[], closed: [] as string[] };
  for (const date of dates) {
    const target = resolveDay({ timezone, config }, date);
    if (closedAllDay(target)) result.closed.push(date);
    else if (sameHoursAs(source, target)) result.same.push(date);
    else result.changed.push(date);
  }
  return result;
}

/**
 * The chosen weekdays whose regular hours already equal the copied day's. Each is compared on the
 * next date it falls on, against the regular week alone: date rules and other schedules'
 * assignments (a named schedule that outranks it) are set aside.
 */
export function regularSameWeekdays(
  config: AvailabilityConfig,
  timezone: string,
  source: ResolvedDay,
  weekdays: readonly number[],
  from: string
): number[] {
  const regular = config.schedules.find((s) => s.isRegular && !s.archivedAt);
  const week = {
    timezone,
    config: {
      ...config,
      dateRules: [],
      assignments: config.assignments.filter((a) => a.scheduleId === regular?.id),
    },
  };
  return weekdays.filter((weekday) => {
    const first = Array.from({ length: 7 }, (_, i) => addDays(from, i)).find(
      (d) => weekdayIndexOf(d) === weekday
    )!;
    return sameHoursAs(source, resolveDay(week, first));
  });
}

/**
 * The config with the regular week also covering these weekdays. A weekday the week is closed on
 * is outside what its rows are encoded over, so an in-place weekday change would be lost there.
 */
function withCoveredDays(
  config: AvailabilityConfig,
  weekdays: readonly number[],
  makeId: () => string
): AvailabilityConfig {
  const regular = config.schedules.find((s) => s.isRegular && !s.archivedAt);
  if (!regular) return config;
  const covered = new Set(
    config.assignments.filter((a) => a.scheduleId === regular.id).flatMap((a) => a.weekdays)
  );
  const missing = weekdays.filter((weekday) => !covered.has(weekday));
  if (missing.length === 0) return config;
  const precedence = Math.max(0, ...config.assignments.map((a) => a.precedence));
  return {
    ...config,
    assignments: [
      ...config.assignments,
      { id: makeId(), scheduleId: regular.id, weekdays: missing, precedence },
    ],
  };
}

/**
 * The regular week as it would be once the chosen weekdays took the copied day's hours: the
 * nudge's in-place weekday change applied once per weekday, then shown the way the week form
 * edits it. Copy and the nudge so never disagree about what copying a day to a weekday does.
 */
export function copyWeekDraft(
  config: AvailabilityConfig,
  source: ResolvedDay,
  date: string,
  weekdays: readonly number[],
  makeId: () => string
): QuickSetupDraft {
  const services = seedServices(config, source, { kind: "date", date });
  const nowIso = new Date().toISOString();
  const next = weekdays.reduce(
    (current, weekday) =>
      applyChanges(
        current,
        buildDraftChanges({
          config: current,
          scope: { kind: "regularWeekday", weekday },
          services,
          makeId,
        }),
        nowIso
      ),
    withCoveredDays(config, weekdays, makeId)
  );
  return draftFromConfig(next, makeId);
}
