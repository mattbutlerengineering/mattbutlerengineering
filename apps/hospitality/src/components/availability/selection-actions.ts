import type { AvailabilityConfig, AvailabilityConfigChanges, DateRule } from "@mbe/types";
import { buildDraftChanges, type DraftService } from "./draft-changes.js";

/**
 * What the selection bar's "Use schedule / another day's hours" and "Clear changes" write
 * (ux.md F-MS). Pure row operations; the dialogs save them through the single config hook.
 */

/**
 * The venue's own one-date hours rules (special hours or use-schedule) on `dates`. A range or
 * repeating rule is left out: removing it would change dates outside the selection. Closures
 * are left out too, since reopening is a different decision with its own flow.
 */
export function ownSingleDateRules(
  config: AvailabilityConfig,
  dates: readonly string[]
): DateRule[] {
  const picked = new Set(dates);
  return config.dateRules.filter(
    (r) =>
      (r.kind === "special_hours" || r.kind === "use_schedule") &&
      r.targetKind === "venue" &&
      r.endsOn === r.startsOn &&
      picked.has(r.startsOn) &&
      r.repeat == null &&
      r.window == null &&
      r.seriesId == null &&
      r.bookingTypes == null &&
      r.venueServiceId == null
  );
}

const removal = (rules: readonly DateRule[]) =>
  rules.length > 0 ? { dateRules: rules.map((r) => r.id) } : {};

/** Selected dates go back to following the regular week (or whichever schedule covers them). */
export function buildClearChanges(
  config: AvailabilityConfig,
  dates: readonly string[]
): AvailabilityConfigChanges {
  return { upsert: {}, remove: removal(ownSingleDateRules(config, dates)) };
}

/** Each selected date uses `scheduleId`'s week, replacing any hours change it had of its own. */
export function buildUseScheduleChanges(
  config: AvailabilityConfig,
  dates: readonly string[],
  scheduleId: string,
  makeId: () => string
): AvailabilityConfigChanges {
  const dateRules: DateRule[] = dates.map((date) => ({
    id: makeId(),
    kind: "use_schedule",
    targetKind: "venue",
    startsOn: date,
    endsOn: date,
    useScheduleId: scheduleId,
  }));
  return {
    upsert: { dateRules },
    remove: removal(ownSingleDateRules(config, dates)),
  };
}

/** Each selected date gets `services` (another day's hours) as its own special hours. */
export function buildUseDayHoursChanges(input: {
  readonly config: AvailabilityConfig;
  readonly services: readonly DraftService[];
  readonly dates: readonly string[];
  readonly makeId: () => string;
}): AvailabilityConfigChanges {
  const { config, services, dates, makeId } = input;
  const own = ownSingleDateRules(config, dates);
  const ownIds = new Set(own.map((r) => r.id));
  // Hand the builder a config without the old rules so it writes fresh ones, then remove those.
  const stripped = { ...config, dateRules: config.dateRules.filter((r) => !ownIds.has(r.id)) };
  const built = buildDraftChanges({
    config: stripped,
    scope: { kind: "dates", dates },
    services,
    makeId,
  });
  return { upsert: built.upsert, remove: removal(own) };
}
