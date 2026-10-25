import { addDays, resolveDay, weekdayIndexOf } from "@mbe/availability";
import type {
  AvailabilityConfig,
  AvailabilityConfigChanges,
  DateRule,
  ScopeConflictMode,
} from "@mbe/types";

/**
 * The pure half of a config save (docs/features/venue-availability/
 * architecture.md § Availability store): apply the row operations, settle
 * scope conflicts, and diff the result against the stored rows into the
 * writes to make and the inverse that undoes them. No I/O; the store
 * (`availability-config.ts`) runs these inside the save transaction.
 */

export type ConfigTable = keyof AvailabilityConfig;
type Row<T extends ConfigTable> = AvailabilityConfig[T][number];
type RowsByTable = { [T in ConfigTable]: AvailabilityConfig[T] };
type IdsByTable = Record<ConfigTable, string[]>;

export const CONFIG_TABLES: readonly ConfigTable[] = [
  "schedules",
  "venueServices",
  "scheduleServices",
  "assignments",
  "dateRules",
];

/** Rows other rows reference: removing one archives it instead of dropping it. */
const ARCHIVED_ON_REMOVE = new Set<ConfigTable>(["schedules", "venueServices"]);

/** How far past its start an open-ended scope conflict is settled date by date. */
export const SCOPE_CONFLICT_HORIZON_DAYS = 366;

const HOURS_RULE_KINDS = new Set<DateRule["kind"]>(["special_hours", "use_schedule"]);

/** Key-order-independent equality for parsed rows. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const sameRow = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);

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

// ── Scope conflicts ─────────────────────────────────────────────────────────

const isHoursRule = (r: DateRule): boolean => HOURS_RULE_KINDS.has(r.kind) && r.seriesId == null;

function coversDate(rule: DateRule, date: string): boolean {
  return (
    rule.startsOn <= date &&
    (rule.endsOn == null || date <= rule.endsOn) &&
    (rule.repeat == null || rule.repeat.weekdays.includes(weekdayIndexOf(date)))
  );
}

/** Dates both rules cover, from their common start, up to the horizon for an open end. */
function sharedDates(a: DateRule, b: DateRule): string[] {
  const from = a.startsOn > b.startsOn ? a.startsOn : b.startsOn;
  const ends = [a.endsOn, b.endsOn, addDays(from, SCOPE_CONFLICT_HORIZON_DAYS - 1)];
  const to = ends.filter((d): d is string => d != null).sort()[0]!;
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (coversDate(a, d) && coversDate(b, d)) dates.push(d);
  }
  return dates;
}

type Skip = { seriesId: string; date: string };

/** Schedules whose services or assignments this change touches. */
function editedSchedules(before: AvailabilityConfig, next: AvailabilityConfig): Set<string> {
  const touched = new Set<string>();
  for (const table of ["scheduleServices", "assignments"] as const) {
    const was = new Map(before[table].map((r) => [r.id, r]));
    const now = new Map(next[table].map((r) => [r.id, r]));
    for (const id of new Set([...was.keys(), ...now.keys()])) {
      const [a, b] = [was.get(id), now.get(id)];
      if (a && b && sameRow(a, b)) continue;
      if (a) touched.add(a.scheduleId);
      if (b) touched.add(b.scheduleId);
    }
  }
  return touched;
}

/**
 * `replace` for an edit to a schedule ("everywhere it is used"): stored dated
 * hours on a future date that schedule runs, before or after the change, are
 * skipped so the edited week shows through. Settled for the 366 days from
 * today.
 */
function scheduleEditSkips(
  before: AvailabilityConfig,
  next: AvailabilityConfig,
  stored: readonly DateRule[],
  today: string
): Skip[] {
  const edited = editedSchedules(before, next);
  if (edited.size === 0 || stored.length === 0) return [];
  // The week alone decides which schedule a date runs; date rules are set aside.
  // Resolved once per date of the window (2 x 366 calls whatever the rule
  // count): this runs inside the save transaction, with the venue row locked.
  const weeks = [before, next].map((config) => ({
    timezone: "UTC",
    config: { ...config, dateRules: [] },
  }));
  const last = addDays(today, SCOPE_CONFLICT_HORIZON_DAYS - 1);
  const inScope = new Set<string>();
  for (let d = today; d <= last; d = addDays(d, 1)) {
    const date = d;
    const ids = weeks.map((w) => resolveDay(w, date).scheduleId);
    if (ids.some((id) => id != null && edited.has(id))) inScope.add(date);
  }
  return stored.flatMap((rule) => {
    const from = rule.startsOn > today ? rule.startsOn : today;
    const to = rule.endsOn != null && rule.endsOn < last ? rule.endsOn : last;
    const skips: Skip[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (inScope.has(d) && coversDate(rule, d)) skips.push({ seriesId: rule.id, date: d });
    }
    return skips;
  });
}

/**
 * Dates in scope that already have their own hours change (special hours or
 * use-schedule), left untouched by this save:
 * - a dated edit (an incoming rule meeting a stored one): `keep` takes the
 *   incoming rule out on the shared dates, `replace` the stored one;
 * - a schedule edit (its services or assignments): `keep` leaves the stored
 *   rules winning, as layers already do; `replace` takes them out on the
 *   future dates that schedule runs.
 * Either way it is a `skip` row pointing at the series it removes, so no
 * rule's own range is rewritten.
 */
export function resolveScopeConflicts(
  before: AvailabilityConfig,
  next: AvailabilityConfig,
  mode: ScopeConflictMode,
  newId: () => string,
  today: string
): AvailabilityConfig {
  const stored = new Map(before.dateRules.map((r) => [r.id, r]));
  const hours = next.dateRules.filter(isHoursRule);
  const incoming = hours.filter((r) => !stored.has(r.id) || !sameRow(stored.get(r.id), r));
  const untouched = hours.filter((r) => stored.has(r.id) && sameRow(stored.get(r.id), r));
  const skipped = new Set(
    next.dateRules.filter((r) => r.kind === "skip").map((r) => `${r.seriesId}@${r.startsOn}`)
  );

  const skips: Skip[] = [
    ...incoming.flatMap((rule) =>
      untouched.flatMap((theirs) =>
        sharedDates(rule, theirs).map((date) => ({
          seriesId: mode === "keep" ? rule.id : theirs.id,
          date,
        }))
      )
    ),
    ...(mode === "replace" ? scheduleEditSkips(before, next, untouched, today) : []),
  ];
  const fresh = skips.filter(({ seriesId, date }) => {
    const key = `${seriesId}@${date}`;
    if (skipped.has(key)) return false;
    skipped.add(key);
    return true;
  });
  if (fresh.length === 0) return next;
  const rows: DateRule[] = fresh.map(({ seriesId, date }) => ({
    id: newId(),
    kind: "skip",
    targetKind: "venue",
    startsOn: date,
    endsOn: date,
    seriesId,
  }));
  return { ...next, dateRules: [...next.dateRules, ...rows] };
}

// ── Diff and inverse ────────────────────────────────────────────────────────

export interface ConfigDiff {
  create: RowsByTable;
  update: RowsByTable;
  /** Ids no longer in the next config; only schedule services, assignments and date rules. */
  remove: IdsByTable;
}

function diffTable<T extends ConfigTable>(
  stored: AvailabilityConfig[T],
  next: AvailabilityConfig[T]
) {
  const before = new Map((stored as Row<T>[]).map((r) => [r.id, r]));
  const after = new Set((next as Row<T>[]).map((r) => r.id));
  const nextRows = next as Row<T>[];
  return {
    create: nextRows.filter((r) => !before.has(r.id)) as AvailabilityConfig[T],
    update: nextRows.filter(
      (r) => before.has(r.id) && !sameRow(before.get(r.id), r)
    ) as AvailabilityConfig[T],
    remove: (stored as Row<T>[]).filter((r) => !after.has(r.id)).map((r) => r.id),
  };
}

export function diffConfig(stored: AvailabilityConfig, next: AvailabilityConfig): ConfigDiff {
  const tables = Object.fromEntries(
    CONFIG_TABLES.map((t) => [t, diffTable(stored[t], next[t])])
  ) as { [T in ConfigTable]: ReturnType<typeof diffTable<T>> };
  for (const table of ARCHIVED_ON_REMOVE) {
    // Invariant: applyChanges archives these instead of dropping them.
    if (tables[table].remove.length > 0) throw new Error(`${table} rows cannot be dropped`);
  }
  const pick = <K extends "create" | "update" | "remove">(k: K) =>
    Object.fromEntries(CONFIG_TABLES.map((t) => [t, tables[t][k]]));
  return {
    create: pick("create") as RowsByTable,
    update: pick("update") as RowsByTable,
    remove: pick("remove") as IdsByTable,
  };
}

/** What undo applies: restore these rows as they were, delete the created ones, and the old column. */
export interface ConfigInverse {
  version: 1;
  restore: RowsByTable;
  remove: IdsByTable;
  operatingHours: unknown;
}

export function inverseOf(
  stored: AvailabilityConfig,
  diff: ConfigDiff,
  operatingHours: unknown
): ConfigInverse {
  const restore = Object.fromEntries(
    CONFIG_TABLES.map((t) => {
      const touched = new Set([
        ...(diff.update[t] as { id: string }[]).map((r) => r.id),
        ...diff.remove[t],
      ]);
      return [t, (stored[t] as { id: string }[]).filter((r) => touched.has(r.id))];
    })
  ) as RowsByTable;
  const remove = Object.fromEntries(
    CONFIG_TABLES.map((t) => [t, (diff.create[t] as { id: string }[]).map((r) => r.id)])
  ) as IdsByTable;
  return { version: 1, restore, remove, operatingHours: operatingHours ?? null };
}

/**
 * The service dates a save can change. Date rules bound it; any other row
 * (the week, a service, a schedule) changes every date from today on.
 */
export function affectedRange(
  stored: AvailabilityConfig,
  diff: ConfigDiff,
  today: string
): { from: string | null; to: string | null } {
  const weekTouched = CONFIG_TABLES.filter((t) => t !== "dateRules").some(
    (t) => diff.create[t].length + diff.update[t].length + diff.remove[t].length > 0
  );
  if (weekTouched) return { from: today, to: null };
  const removed = new Set(diff.remove.dateRules);
  const updated = new Set(diff.update.dateRules.map((r) => r.id));
  const rules = [
    ...diff.create.dateRules,
    ...diff.update.dateRules,
    ...stored.dateRules.filter((r) => removed.has(r.id) || updated.has(r.id)),
  ];
  if (rules.length === 0) return { from: null, to: null };
  const from = rules.map((r) => r.startsOn).sort()[0]!;
  const to = rules.some((r) => r.endsOn == null)
    ? null
    : rules
        .map((r) => r.endsOn as string)
        .sort()
        .at(-1)!;
  return { from, to };
}

// ── References ──────────────────────────────────────────────────────────────

/**
 * An issue only the store can see: a reference to a row outside this venue's
 * config, or (on write) an id or unique value another row already holds.
 */
export interface ReferenceIssue {
  path: string;
  code: "unknown_reference" | "id_taken" | "duplicate_row";
  message: string;
}

/**
 * Every schedule, service and table a row points at must be the venue's own.
 * The foreign keys alone would accept another venue's id. `seriesId` is not
 * checked: it may name a removed rule, and it only ever takes rules out.
 */
export function referenceIssues(
  config: AvailabilityConfig,
  venueTableIds: ReadonlySet<string>
): ReferenceIssue[] {
  const schedules = new Set(config.schedules.map((s) => s.id));
  const services = new Set(config.venueServices.map((s) => s.id));
  const check = (path: string, id: string, known: ReadonlySet<string>): ReferenceIssue[] =>
    known.has(id)
      ? []
      : [{ path, code: "unknown_reference", message: "Refers to a row this venue does not have." }];

  return [
    ...config.scheduleServices.flatMap((s, i) => [
      ...check(`scheduleServices[${i}].scheduleId`, s.scheduleId, schedules),
      ...check(`scheduleServices[${i}].venueServiceId`, s.venueServiceId, services),
    ]),
    ...config.assignments.flatMap((a, i) =>
      check(`assignments[${i}].scheduleId`, a.scheduleId, schedules)
    ),
    ...config.dateRules.flatMap((r, i) => [
      ...(r.venueServiceId
        ? check(`dateRules[${i}].venueServiceId`, r.venueServiceId, services)
        : []),
      ...(r.kind === "use_schedule"
        ? check(`dateRules[${i}].useScheduleId`, r.useScheduleId, schedules)
        : []),
      ...(r.kind === "special_hours"
        ? r.payload.services.flatMap((s, j) =>
            check(
              `dateRules[${i}].payload.services[${j}].venueServiceId`,
              s.venueServiceId,
              services
            )
          )
        : []),
      ...(r.tableIds ?? []).flatMap((t, k) =>
        check(`dateRules[${i}].tableIds[${k}]`, t, venueTableIds)
      ),
    ]),
  ];
}
