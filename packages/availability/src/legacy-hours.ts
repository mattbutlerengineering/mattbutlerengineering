import { MINUTES_PER_DAY, WEEKDAYS, type ServiceDate, type Weekday } from "./types.js";

/**
 * The normaliser for the legacy `Venue.operatingHours` column. It reads every
 * stored shape into one in-memory form and reports an unrecognised shape as a
 * typed failure instead of guessing (docs/features/venue-availability/
 * architecture.md § Migration). Pure: no I/O, never throws.
 *
 * Shapes:
 * - `weekday`: `{ monday: { open, close, closed? }, … }` — what the app writes.
 * - `seed_array`: `[{ dayOfWeek (0 = Sunday), openTime, closeTime, isClosed }]` — what the seed wrote.
 * - `v2`: `{ version: 2, weekly: { monday: [{ name?, open, close }] }, overrides }` — the prior-art shape.
 */

export type LegacyShape = "weekday" | "seed_array" | "v2";

/** A service window in minutes past the service day's midnight. `close` may exceed 1440. */
export interface LegacyWindow {
  name?: string;
  open: number;
  close: number;
  /** The stored close was at or before the open, so it was read as past midnight. */
  wrapped?: true;
}

/** A dated override; no windows means closed. */
export interface LegacyOverride {
  date: ServiceDate;
  windows: readonly LegacyWindow[];
  note?: string;
}

export interface LegacyHours {
  weekly: Readonly<Record<Weekday, readonly LegacyWindow[]>>;
  overrides: readonly LegacyOverride[];
}

export type LegacyHoursFailure =
  | { ok: false; reason: "no_hours" }
  | { ok: false; reason: "unknown_shape"; detail: string }
  | { ok: false; reason: "unknown_version"; detail: string }
  /** A day the legacy code treated as open has a time this parser cannot read. */
  | { ok: false; reason: "unreadable_time"; detail: string }
  /** A v2 override has a date that is not a plain YYYY-MM-DD; dropping it could open a closed date. */
  | { ok: false; reason: "unreadable_date"; detail: string };

export type LegacyHoursResult =
  { ok: true; shape: LegacyShape; hours: LegacyHours } | LegacyHoursFailure;

type Loose = Record<string, unknown>;

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME = /^([01]?\d|2[0-4]):([0-5]\d)$/;
/** Stored weekday index: 0 = Sunday. */
const SUNDAY_FIRST: readonly Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const isObject = (value: unknown): value is Loose =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** "HH:MM" → minutes; "24:00" is the end of the day. Anything else is `null`. */
function parseTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = TIME.exec(value);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes > MINUTES_PER_DAY ? null : minutes;
}

/** Collects what could not be read; any entry fails the venue. Date problems start with `DATE_PROBLEM`. */
type Problems = string[];
const DATE_PROBLEM = "date: ";

/**
 * A window, or `null` when it cannot seat anyone (open == close). An open day
 * whose times cannot be read is recorded in `problems` — it is never read as
 * closed. A close before the open runs past midnight (ADR-029).
 */
function toWindow(
  where: string,
  problems: Problems,
  open: unknown,
  close: unknown,
  name?: unknown
): LegacyWindow | null {
  const o = parseTime(open);
  const c = parseTime(close);
  if (o === null || c === null || o >= MINUTES_PER_DAY) {
    problems.push(`${where}: open ${JSON.stringify(open)}, close ${JSON.stringify(close)}`);
    return null;
  }
  if (o === c) return null;
  const wrapped = c < o;
  const window = {
    open: o,
    close: wrapped ? c + MINUTES_PER_DAY : c,
    ...(wrapped ? { wrapped: true as const } : {}),
  };
  return typeof name === "string" && name.length > 0 ? { name, ...window } : window;
}

const isWindow = (w: LegacyWindow | null): w is LegacyWindow => w !== null;

const sortedByOpen = (windows: LegacyWindow[]): LegacyWindow[] =>
  [...windows].sort((a, b) => a.open - b.open);

function finish(shape: LegacyShape, problems: Problems, hours: LegacyHours): LegacyHoursResult {
  if (problems.length === 0) return { ok: true, shape, hours };
  const reason = problems.some((p) => p.startsWith(DATE_PROBLEM))
    ? "unreadable_date"
    : "unreadable_time";
  return { ok: false, reason, detail: problems.join("; ") };
}

function weeklyFrom(
  windowsFor: (day: Weekday) => LegacyWindow[]
): Record<Weekday, readonly LegacyWindow[]> {
  return Object.fromEntries(
    WEEKDAYS.map((d) => [d, sortedByOpen(windowsFor(d))])
  ) as unknown as Record<Weekday, readonly LegacyWindow[]>;
}

function fromWeekdayKeyed(raw: Loose): LegacyHoursResult {
  if (!WEEKDAYS.some((day) => day in raw)) {
    return { ok: false, reason: "unknown_shape", detail: "no weekday keys" };
  }
  const problems: Problems = [];
  // As the legacy code: a missing day, or one flagged `closed` (truthy), is closed.
  const dayWindows = (day: Weekday): LegacyWindow[] => {
    const value = raw[day];
    if (!isObject(value) || value.closed) return [];
    const window = toWindow(day, problems, value.open, value.close);
    return window ? [window] : [];
  };
  const weekly = weeklyFrom(dayWindows);
  return finish("weekday", problems, { weekly, overrides: [] });
}

function fromSeedArray(raw: unknown[]): LegacyHoursResult {
  const rows = raw.filter(isObject);
  const dayIndexOk = (row: Loose) =>
    typeof row.dayOfWeek === "number" &&
    Number.isInteger(row.dayOfWeek) &&
    row.dayOfWeek >= 0 &&
    row.dayOfWeek <= 6;
  if (rows.length === 0 || rows.length !== raw.length || !rows.every(dayIndexOk)) {
    return { ok: false, reason: "unknown_shape", detail: "array rows lack a 0-6 dayOfWeek" };
  }
  const problems: Problems = [];
  const windowsFor = (day: Weekday) =>
    rows
      .filter((row) => !row.isClosed && SUNDAY_FIRST[row.dayOfWeek as number] === day)
      .map((row) => toWindow(day, problems, row.openTime, row.closeTime))
      .filter(isWindow);
  const weekly = weeklyFrom(windowsFor);
  return finish("seed_array", problems, { weekly, overrides: [] });
}

function toWindows(where: string, problems: Problems, raw: unknown): LegacyWindow[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    problems.push(`${where}: windows is not an array`);
    return [];
  }
  return raw.flatMap((w, i) => {
    if (!isObject(w)) {
      problems.push(`${where}: window ${i} is not an object`);
      return [];
    }
    const window = toWindow(where, problems, w.open, w.close, w.name);
    return window ? [window] : [];
  });
}

function toOverrides(problems: Problems, raw: unknown): LegacyOverride[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    problems.push(`${DATE_PROBLEM}overrides is not an array`);
    return [];
  }
  const byDate = new Map<string, LegacyOverride>();
  for (const entry of raw) {
    if (!isObject(entry) || typeof entry.date !== "string" || !ISO_DATE.test(entry.date)) {
      problems.push(
        `${DATE_PROBLEM}override date ${JSON.stringify(isObject(entry) ? entry.date : entry)}`
      );
      continue;
    }
    if (byDate.has(entry.date)) continue;
    const where = `override ${entry.date}`;
    if (!entry.closed && !Array.isArray(entry.windows)) {
      problems.push(`${where}: open override has no windows array`);
    }
    const windows = entry.closed ? [] : sortedByOpen(toWindows(where, problems, entry.windows));
    byDate.set(entry.date, {
      date: entry.date,
      windows,
      ...(typeof entry.note === "string" ? { note: entry.note } : {}),
    });
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

function fromV2(raw: Loose): LegacyHoursResult {
  if (!isObject(raw.weekly)) {
    return { ok: false, reason: "unknown_shape", detail: "v2 document has no weekly object" };
  }
  const weeklyRaw = raw.weekly;
  const problems: Problems = [];
  const weekly = weeklyFrom((day) => toWindows(day, problems, weeklyRaw[day]));
  return finish("v2", problems, { weekly, overrides: toOverrides(problems, raw.overrides) });
}

export function normalizeLegacyHours(raw: unknown): LegacyHoursResult {
  if (raw === null || raw === undefined) return { ok: false, reason: "no_hours" };
  if (Array.isArray(raw)) return fromSeedArray(raw);
  if (!isObject(raw)) {
    return { ok: false, reason: "unknown_shape", detail: `unexpected ${typeof raw} value` };
  }
  if ("version" in raw) {
    return raw.version === 2
      ? fromV2(raw)
      : { ok: false, reason: "unknown_version", detail: `version ${JSON.stringify(raw.version)}` };
  }
  return fromWeekdayKeyed(raw);
}
