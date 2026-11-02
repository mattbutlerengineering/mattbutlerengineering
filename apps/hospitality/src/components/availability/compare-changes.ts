import type { AvailabilityConfig, AvailabilityConfigChanges, ScheduleService } from "@mbe/types";

/**
 * Compare services (ux.md F-X): one service's hours across every schedule that runs it, edited
 * in place and saved as one change. Pure; the grid is `CompareServices.tsx`.
 */

/** The editable fields of one schedule's version of the service. */
type Hours = Pick<
  ScheduleService,
  "opensAt" | "lastSeatingAt" | "closesAt" | "seating" | "bookingTypes"
>;

export interface CompareRow extends Hours {
  readonly scheduleServiceId: string;
  readonly scheduleId: string;
  readonly scheduleName: string;
}

const hoursOf = (s: Hours) =>
  JSON.stringify([s.opensAt, s.lastSeatingAt, s.closesAt, s.seating, s.bookingTypes]);

const liveScheduleIds = (config: AvailabilityConfig) =>
  new Set(config.schedules.filter((s) => !s.archivedAt).map((s) => s.id));

/** Services that more than one schedule runs; comparing a service in one schedule says nothing. */
export function compareServiceOptions(config: AvailabilityConfig) {
  const live = liveScheduleIds(config);
  return config.venueServices
    .filter((v) => !v.archivedAt)
    .filter(
      (v) =>
        config.scheduleServices.filter((s) => s.venueServiceId === v.id && live.has(s.scheduleId))
          .length > 1
    )
    .sort((a, b) => a.position - b.position);
}

export function compareRows(config: AvailabilityConfig, venueServiceId: string): CompareRow[] {
  const names = new Map(config.schedules.filter((s) => !s.archivedAt).map((s) => [s.id, s.name]));
  return config.scheduleServices
    .filter((s) => s.venueServiceId === venueServiceId && names.has(s.scheduleId))
    .map((s) => ({
      scheduleServiceId: s.id,
      scheduleId: s.scheduleId,
      scheduleName: names.get(s.scheduleId) ?? s.scheduleId,
      opensAt: s.opensAt,
      lastSeatingAt: s.lastSeatingAt,
      closesAt: s.closesAt,
      seating: s.seating,
      bookingTypes: s.bookingTypes,
    }));
}

/** The rows whose hours differ from what is stored. */
export function changedRows(config: AvailabilityConfig, rows: readonly CompareRow[]): CompareRow[] {
  const stored = new Map(config.scheduleServices.map((s) => [s.id, s]));
  return rows.filter((r) => {
    const was = stored.get(r.scheduleServiceId);
    return was !== undefined && hoursOf(was) !== hoursOf(r);
  });
}

const HOURS_FIELDS = ["opensAt", "lastSeatingAt", "closesAt", "seating", "bookingTypes"] as const;
const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Names of the edited rows a colleague changed in the version that won, for the conflict review. */
export function rowsChangedSince(
  before: AvailabilityConfig,
  after: AvailabilityConfig,
  edits: readonly CompareRow[]
): string[] {
  const was = new Map(before.scheduleServices.map((s) => [s.id, s]));
  const now = new Map(after.scheduleServices.map((s) => [s.id, s]));
  return edits
    .filter((e) => {
      const old = was.get(e.scheduleServiceId);
      const next = now.get(e.scheduleServiceId);
      return old !== undefined && next !== undefined && hoursOf(old) !== hoursOf(next);
    })
    .map((e) => e.scheduleName);
}

/**
 * Names of the edited rows that Compare no longer offers in the version that won: deleted, or
 * their schedule archived. The same source `reapplyEdits` uses, so a row it drops is named here.
 */
export function rowsRemovedSince(
  after: AvailabilityConfig,
  edits: readonly CompareRow[]
): string[] {
  const now = compareRowsById(after);
  return edits.filter((e) => !now.has(e.scheduleServiceId)).map((e) => e.scheduleName);
}

/**
 * The Manager's edits laid on the winning version: per row, only the fields they changed from
 * `before` are applied, so a colleague's change to another field stays. Rows that no longer exist
 * are dropped.
 */
export function reapplyEdits(
  before: AvailabilityConfig,
  after: AvailabilityConfig,
  edits: readonly CompareRow[]
): Record<string, CompareRow> {
  const was = new Map(before.scheduleServices.map((s) => [s.id, s]));
  const latest = compareRowsById(after);
  const entries = edits.flatMap((e) => {
    const old = was.get(e.scheduleServiceId);
    const next = latest.get(e.scheduleServiceId);
    if (!old || !next) return [];
    const mine = HOURS_FIELDS.filter((f) => !sameValue(old[f], e[f]));
    const merged = { ...next, ...Object.fromEntries(mine.map((f) => [f, e[f]])) } as CompareRow;
    return [[e.scheduleServiceId, merged] as const];
  });
  return Object.fromEntries(entries);
}

function compareRowsById(config: AvailabilityConfig): Map<string, CompareRow> {
  const rows = config.venueServices.flatMap((v) => compareRows(config, v.id));
  return new Map(rows.map((r) => [r.scheduleServiceId, r]));
}

/** One save for every changed row. */
export function buildCompareChanges(
  config: AvailabilityConfig,
  rows: readonly CompareRow[]
): AvailabilityConfigChanges {
  const stored = new Map(config.scheduleServices.map((s) => [s.id, s]));
  const scheduleServices = changedRows(config, rows).map((r) => ({
    ...stored.get(r.scheduleServiceId)!,
    opensAt: r.opensAt,
    lastSeatingAt: r.lastSeatingAt,
    closesAt: r.closesAt,
    seating: r.seating,
    bookingTypes: [...r.bookingTypes],
  }));
  return { upsert: scheduleServices.length > 0 ? { scheduleServices } : {}, remove: {} };
}
