import type { AvailabilityConfig, AvailabilityConfigChanges } from "@mbe/types";
import type { AvailabilitySnapshot } from "./resolve-day.js";

/**
 * A draft is the same row operations a config save applies. Applying one is
 * pure: the snapshot in is never changed, which is what lets the preview
 * compare "now" with "after" from one load.
 */

type ConfigTable = keyof AvailabilityConfig;
type Row<T extends ConfigTable> = AvailabilityConfig[T][number];

/** Rows other rows reference: removing one archives it instead of dropping it. */
export const ARCHIVED_ON_REMOVE: ReadonlySet<ConfigTable> = new Set<ConfigTable>([
  "schedules",
  "venueServices",
]);

function applyTable<T extends ConfigTable>(
  table: T,
  rows: AvailabilityConfig[T],
  changes: AvailabilityConfigChanges,
  nowIso: string
): AvailabilityConfig[T] {
  const upserts = (changes.upsert[table] ?? []) as Row<T>[];
  const removed = new Set(changes.remove[table] ?? []);
  const byId = new Map(upserts.map((r) => [r.id, r]));
  const kept = (rows as Row<T>[]).flatMap((row): Row<T>[] => {
    const replaced = byId.get(row.id) ?? row;
    if (!removed.has(row.id)) return [replaced];
    return ARCHIVED_ON_REMOVE.has(table) ? [{ ...replaced, archivedAt: nowIso }] : [];
  });
  const known = new Set((rows as Row<T>[]).map((r) => r.id));
  const added = upserts.filter((r) => !known.has(r.id) && !removed.has(r.id));
  return [...kept, ...added] as AvailabilityConfig[T];
}

export function applyChanges(
  config: AvailabilityConfig,
  changes: AvailabilityConfigChanges,
  nowIso: string
): AvailabilityConfig {
  return {
    schedules: applyTable("schedules", config.schedules, changes, nowIso),
    venueServices: applyTable("venueServices", config.venueServices, changes, nowIso),
    scheduleServices: applyTable("scheduleServices", config.scheduleServices, changes, nowIso),
    assignments: applyTable("assignments", config.assignments, changes, nowIso),
    dateRules: applyTable("dateRules", config.dateRules, changes, nowIso),
  };
}

/** The snapshot as it would be once `changes` were saved. */
export function applyDraft<S extends AvailabilitySnapshot>(
  snapshot: S,
  changes: AvailabilityConfigChanges,
  nowIso: string
): S {
  return { ...snapshot, config: applyChanges(snapshot.config, changes, nowIso) };
}
