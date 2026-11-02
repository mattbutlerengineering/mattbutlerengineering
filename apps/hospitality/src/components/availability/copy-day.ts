import { addDays, weekdayIndexOf } from "@mbe/availability";
import type { AvailabilityConfig, AvailabilityConfigChanges } from "@mbe/types";
import { buildDraftChanges, type DraftService } from "./draft-changes.js";
import { SCOPE_HORIZON_DAYS } from "./scope-dates.js";

/** Copy a day to other weekdays (ux.md F4), and the discovery nudge that suggests a schedule. */

export interface CopyTarget {
  readonly weekdays: readonly number[];
  readonly from: string;
  /** `null`: until changed again. */
  readonly until: string | null;
  /** Today on the venue clock: dates before it are history and are not copied to. */
  readonly today?: string;
}

/**
 * The dates a copy reaches, from the later of the start and today; an open end is counted to
 * the server's one-year horizon from the start.
 */
export function copyDayDates(target: CopyTarget): string[] {
  const last = addDays(target.from, SCOPE_HORIZON_DAYS - 1);
  const end = target.until !== null && target.until < last ? target.until : last;
  const first =
    target.today !== undefined && target.today > target.from ? target.today : target.from;
  const dates: string[] = [];
  for (let d = first; d <= end; d = addDays(d, 1)) {
    if (target.weekdays.includes(weekdayIndexOf(d))) dates.push(d);
  }
  return dates;
}

/** One repeating special-hours rule carrying the day's services to the chosen weekdays. */
export function buildCopyDayChanges(
  input: CopyTarget & {
    readonly config: AvailabilityConfig;
    readonly services: readonly DraftService[];
    readonly makeId: () => string;
  }
): AvailabilityConfigChanges {
  const base = buildDraftChanges({
    config: input.config,
    scope: { kind: "weekday", from: input.from, until: input.until },
    services: input.services,
    makeId: input.makeId,
    today: input.today,
  });
  const weekdays = [...input.weekdays].sort((a, b) => a - b);
  return {
    ...base,
    upsert: {
      ...base.upsert,
      dateRules: base.upsert.dateRules?.map((rule) => ({
        ...rule,
        repeat: { version: 1 as const, weekdays },
      })),
    },
  };
}

/** How many times the venue changed this weekday for a single date (the nudge fires at three). */
export function singleDateChangeCount(config: AvailabilityConfig, weekday: number): number {
  return config.dateRules.filter(
    (r) =>
      r.kind === "special_hours" &&
      r.targetKind === "venue" &&
      r.endsOn === r.startsOn &&
      r.repeat == null &&
      r.window == null &&
      r.seriesId == null &&
      weekdayIndexOf(r.startsOn) === weekday
  ).length;
}

export const NUDGE_THRESHOLD = 3;
