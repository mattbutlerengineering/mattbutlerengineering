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
  | { ok: false; reason: "unknown_version"; detail: string };

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

/**
 * A window, or `null` when it cannot seat anyone: unreadable times read as
 * closed (as the legacy slot loop does), and open == close is no window. A
 * close at or before the open runs past midnight (ADR-029).
 */
function toWindow(open: unknown, close: unknown, name?: unknown): LegacyWindow | null {
  const o = parseTime(open);
  const c = parseTime(close);
  if (o === null || c === null || o >= MINUTES_PER_DAY || o === c) return null;
  const window = { open: o, close: c < o ? c + MINUTES_PER_DAY : c };
  return typeof name === "string" && name.length > 0 ? { name, ...window } : window;
}

const isWindow = (w: LegacyWindow | null): w is LegacyWindow => w !== null;

const sortedByOpen = (windows: LegacyWindow[]): LegacyWindow[] =>
  [...windows].sort((a, b) => a.open - b.open);

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
  const dayWindows = (value: unknown): LegacyWindow[] => {
    if (!isObject(value) || value.closed === true) return [];
    const window = toWindow(value.open, value.close);
    return window ? [window] : [];
  };
  return {
    ok: true,
    shape: "weekday",
    hours: { weekly: weeklyFrom((day) => dayWindows(raw[day])), overrides: [] },
  };
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
  const windowsFor = (day: Weekday) =>
    rows
      .filter((row) => row.isClosed !== true && SUNDAY_FIRST[row.dayOfWeek as number] === day)
      .map((row) => toWindow(row.openTime, row.closeTime))
      .filter(isWindow);
  return {
    ok: true,
    shape: "seed_array",
    hours: { weekly: weeklyFrom(windowsFor), overrides: [] },
  };
}

function toWindows(raw: unknown): LegacyWindow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isObject)
    .map((w) => toWindow(w.open, w.close, w.name))
    .filter(isWindow);
}

function toOverrides(raw: unknown): LegacyOverride[] {
  if (!Array.isArray(raw)) return [];
  const byDate = new Map<string, LegacyOverride>();
  for (const entry of raw) {
    if (!isObject(entry) || typeof entry.date !== "string" || !ISO_DATE.test(entry.date)) continue;
    if (byDate.has(entry.date)) continue;
    const windows = entry.closed === true ? [] : sortedByOpen(toWindows(entry.windows));
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
  const weekly = raw.weekly;
  return {
    ok: true,
    shape: "v2",
    hours: {
      weekly: weeklyFrom((day) => toWindows(weekly[day])),
      overrides: toOverrides(raw.overrides),
    },
  };
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
