import type { AvailabilityConfig, AvailabilityConfigChanges, ScheduleService } from "@mbe/types";
import { compareRows } from "./compare-changes.js";

/**
 * Also apply to (ux.md F-X step 4): while one schedule's services are edited, the same times can
 * go to the other schedules that run the service. Pure; the control is `AlsoApplyTo.tsx`, and the
 * result is one save, so impact, undo and history see one change across every schedule it touches.
 */

export interface AlsoApplyTarget {
  readonly scheduleId: string;
  readonly scheduleName: string;
}

/** A service whose times the edit changed, and the other schedules that run it. */
export interface AlsoApplyOption {
  readonly venueServiceId: string;
  readonly serviceName: string;
  readonly targets: readonly AlsoApplyTarget[];
}

/** The Manager's picks: the schedule ids chosen per service (`venueServiceId`). */
export type AlsoApplyPicks = Readonly<Record<string, readonly string[]>>;

const TIME_FIELDS = ["opensAt", "lastSeatingAt", "closesAt"] as const;
const timesOf = (s: ScheduleService) => TIME_FIELDS.map((f) => s[f]).join();

/**
 * The rows `edit` writes into `sourceScheduleId` whose times differ from what is stored, paired
 * with their stored row. A row the schedule did not have yet has nothing to carry over.
 */
function changedSourceRows(
  config: AvailabilityConfig,
  edit: AvailabilityConfigChanges,
  sourceScheduleId: string
): ScheduleService[] {
  const stored = new Map(config.scheduleServices.map((s) => [s.id, s]));
  return (edit.upsert.scheduleServices ?? []).filter((row) => {
    const was = stored.get(row.id);
    return (
      row.scheduleId === sourceScheduleId &&
      was !== undefined &&
      was.scheduleId === sourceScheduleId &&
      timesOf(was) !== timesOf(row)
    );
  });
}

/**
 * The other schedules each changed service could take the new times in: the schedules Compare
 * services lists for it, so a hidden one (archived, or a replaced regular week, #8688) is never
 * offered. `serviceDate` is the venue's current service date.
 */
export function alsoApplyOptions(
  config: AvailabilityConfig,
  edit: AvailabilityConfigChanges,
  sourceScheduleId: string,
  serviceDate: string
): AlsoApplyOption[] {
  const names = new Map(config.venueServices.map((v) => [v.id, v.name]));
  return changedSourceRows(config, edit, sourceScheduleId).flatMap((row) => {
    const targets = compareRows(config, row.venueServiceId, serviceDate)
      .filter((r) => r.scheduleId !== sourceScheduleId)
      .map((r) => ({ scheduleId: r.scheduleId, scheduleName: r.scheduleName }));
    return targets.length === 0
      ? []
      : [
          {
            venueServiceId: row.venueServiceId,
            serviceName: names.get(row.venueServiceId) ?? row.venueServiceId,
            targets,
          },
        ];
  });
}

/** The picks that are still offered: a service or schedule that dropped out of the options is gone. */
export function pruneAlsoApply(
  options: readonly AlsoApplyOption[],
  picks: AlsoApplyPicks
): AlsoApplyPicks {
  return Object.fromEntries(
    options.flatMap((o) => {
      const offered = new Set(o.targets.map((t) => t.scheduleId));
      const kept = (picks[o.venueServiceId] ?? []).filter((id) => offered.has(id));
      return kept.length > 0 ? [[o.venueServiceId, kept] as const] : [];
    })
  );
}

/** Every schedule picked for any service, once. */
export function alsoApplyScheduleIds(
  options: readonly AlsoApplyOption[],
  picks: AlsoApplyPicks
): string[] {
  return [...new Set(Object.values(pruneAlsoApply(options, picks)).flat())];
}

/**
 * The edit plus, for each picked schedule, its row of the service with the times the edit
 * changed (opens, last seating, closes); a time the edit left alone stays the target's own, as do
 * its seating, booking types, days and different hours.
 */
export function buildAlsoApplyChanges(
  config: AvailabilityConfig,
  edit: AvailabilityConfigChanges,
  sourceScheduleId: string,
  picks: AlsoApplyPicks,
  serviceDate: string
): AvailabilityConfigChanges {
  const options = alsoApplyOptions(config, edit, sourceScheduleId, serviceDate);
  const wanted = pruneAlsoApply(options, picks);
  const stored = new Map(config.scheduleServices.map((s) => [s.id, s]));
  const source = new Map(
    changedSourceRows(config, edit, sourceScheduleId).map((r) => [r.venueServiceId, r])
  );
  const extra = Object.entries(wanted).flatMap(([venueServiceId, scheduleIds]) => {
    const to = source.get(venueServiceId);
    const was = to ? stored.get(to.id) : undefined;
    if (!to || !was) return [];
    const moved = Object.fromEntries(
      TIME_FIELDS.filter((f) => to[f] !== was[f]).map((f) => [f, to[f]])
    );
    return config.scheduleServices
      .filter((s) => s.venueServiceId === venueServiceId && scheduleIds.includes(s.scheduleId))
      .map((s) => ({ ...s, ...moved }));
  });
  if (extra.length === 0) return edit;
  return {
    ...edit,
    upsert: {
      ...edit.upsert,
      scheduleServices: [...(edit.upsert.scheduleServices ?? []), ...extra],
    },
  };
}

/**
 * For the conflict review: the picked schedules whose row of the service a colleague changed in
 * the version that won, and those that no longer run it (row deleted, schedule archived or gone).
 */
export function alsoApplyChangedSince(
  before: AvailabilityConfig,
  after: AvailabilityConfig,
  picks: AlsoApplyPicks
): { changed: string[]; removed: string[] } {
  const rowOf = (config: AvailabilityConfig, vs: string, scheduleId: string) =>
    config.scheduleServices.find((s) => s.venueServiceId === vs && s.scheduleId === scheduleId);
  const live = (config: AvailabilityConfig, scheduleId: string) =>
    config.schedules.find((s) => s.id === scheduleId && !s.archivedAt);
  const changed: string[] = [];
  const removed: string[] = [];
  for (const [vs, scheduleIds] of Object.entries(picks)) {
    for (const scheduleId of scheduleIds) {
      const was = rowOf(before, vs, scheduleId);
      const name = (live(before, scheduleId) ?? before.schedules.find((s) => s.id === scheduleId))
        ?.name;
      if (!was || name === undefined) continue;
      const now = rowOf(after, vs, scheduleId);
      if (!now || !live(after, scheduleId)) removed.push(name);
      else if (JSON.stringify(was) !== JSON.stringify(now)) changed.push(name);
    }
  }
  return { changed: [...new Set(changed)], removed: [...new Set(removed)] };
}
