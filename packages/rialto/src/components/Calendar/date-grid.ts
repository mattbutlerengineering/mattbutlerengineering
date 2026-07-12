/**
 * Pure ISO-date, locale, and month-grid helpers shared by the calendar family
 * (Calendar single-date grid, DateRange range grid). All functions operate on
 * `yyyy-mm-dd` ISO strings and are guarded for `noUncheckedIndexedAccess`; none
 * carry component state, so they are trivially unit-testable and reusable.
 */

/** A calendar month, expressed with a zero-based month index (0 = January). */
export interface CalendarMonth {
  readonly year: number;
  readonly month: number;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

/** Parse a `yyyy-mm-dd` string into calendar parts, or `null` when malformed. */
export function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  const match = ISO_DATE.exec(iso);
  if (!match) return null;

  const year = Number(match[1] ?? 0);
  const month = Number(match[2] ?? 0); // 1-12 as authored
  const day = Number(match[3] ?? 0);

  // Reject impossible dates (e.g. 2024-02-31) by round-tripping through UTC.
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/** Build a `yyyy-mm-dd` string from year, zero-based month, and day (overflow normalised). */
export function toIsoDate(year: number, month: number, day: number): string {
  const utc = new Date(Date.UTC(year, month, day));
  return `${pad(utc.getUTCFullYear(), 4)}-${pad(utc.getUTCMonth() + 1, 2)}-${pad(
    utc.getUTCDate(),
    2
  )}`;
}

function isoToUtc(iso: string): Date {
  const parts = parseIsoDate(iso);
  const safe = parts ?? { year: 1970, month: 1, day: 1 };
  return new Date(Date.UTC(safe.year, safe.month - 1, safe.day));
}

export function addDays(iso: string, delta: number): string {
  const utc = isoToUtc(iso);
  return toIsoDate(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate() + delta);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Add months to an ISO date, clamping the day to the target month's length. */
export function addMonthsToIso(iso: string, delta: number): string {
  const parts = parseIsoDate(iso) ?? { year: 1970, month: 1, day: 1 };
  const target = addMonthsToMonth({ year: parts.year, month: parts.month - 1 }, delta);
  const day = Math.min(parts.day, daysInMonth(target.year, target.month));
  return toIsoDate(target.year, target.month, day);
}

export function addMonthsToMonth(month: CalendarMonth, delta: number): CalendarMonth {
  const total = month.year * 12 + month.month + delta;
  const year = Math.floor(total / 12);
  return { year, month: total - year * 12 };
}

export function monthOfIso(iso: string): CalendarMonth {
  const parts = parseIsoDate(iso) ?? { year: 1970, month: 1, day: 1 };
  return { year: parts.year, month: parts.month - 1 };
}

export function startOfWeek(iso: string, weekStartsOn: number): string {
  const lead = (isoToUtc(iso).getUTCDay() - weekStartsOn + 7) % 7;
  return addDays(iso, -lead);
}

/** Build a stable 6-row grid of ISO dates covering the given month. */
export function buildWeeks(month: CalendarMonth, weekStartsOn: number): string[][] {
  const gridStart = startOfWeek(toIsoDate(month.year, month.month, 1), weekStartsOn);
  const weeks: string[][] = [];
  let cursor = gridStart;

  for (let week = 0; week < 6; week += 1) {
    const row: string[] = [];
    for (let day = 0; day < 7; day += 1) {
      row.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(row);
  }

  return weeks;
}

/* ── Locale helpers ────────────────────────────────────────────────────────── */

interface WeekInfoLike {
  readonly firstDay: number;
}

/** Resolve the first day of the week (0 = Sunday) from an explicit prop or the locale. */
export function resolveWeekStart(
  locale: string | undefined,
  weekStartsOn: number | undefined
): number {
  if (weekStartsOn !== undefined) return weekStartsOn;

  try {
    const resolved = new Intl.Locale(locale ?? "en-US") as Intl.Locale & {
      readonly weekInfo?: WeekInfoLike;
      readonly getWeekInfo?: () => WeekInfoLike;
    };
    const info =
      typeof resolved.getWeekInfo === "function" ? resolved.getWeekInfo() : resolved.weekInfo;
    if (info && typeof info.firstDay === "number") {
      // Intl reports 1 (Monday) … 7 (Sunday); normalise to 0 (Sunday) … 6.
      return info.firstDay % 7;
    }
  } catch {
    // Fall through to the Monday default for unsupported locales/runtimes.
  }

  return 1; // Monday
}

// A known Sunday, used purely to derive locale-aware weekday labels.
const WEEKDAY_REFERENCE = Date.UTC(2023, 0, 1); // 2023-01-01 is a Sunday.

export function weekdayLabels(
  locale: string | undefined,
  weekStartsOn: number
): { short: string; long: string }[] {
  const shortFmt = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const longFmt = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
  const day = 24 * 60 * 60 * 1000;

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(WEEKDAY_REFERENCE + ((weekStartsOn + index) % 7) * day);
    return { short: shortFmt.format(date), long: longFmt.format(date) };
  });
}

export function localToday(): string {
  const now = new Date();
  return toIsoDate(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Format an ISO date's owning month as a locale-aware "Month YYYY" label. */
export function monthLabel(month: CalendarMonth, locale: string | undefined): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(month.year, month.month, 1)));
}
