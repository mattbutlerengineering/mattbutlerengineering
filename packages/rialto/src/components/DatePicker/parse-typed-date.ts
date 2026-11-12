/**
 * Strict reader for a date typed into an editable DatePicker. Typed text is
 * untrusted: anything that is not exactly one real calendar date yields `null`,
 * and nothing here throws.
 *
 * Accepted, for the field's locale:
 * - ISO `yyyy-mm-dd`
 * - the locale's numeric order with `/`, `.` or `-` (`6/20/2024` in en-US,
 *   `20/6/2024` in en-GB)
 * - a short or long month name with a day, in either order (`Jun 20, 2024`,
 *   `20 juin 2024`), which covers what the field itself displays
 *
 * The year may be left off (`Dec 26`, `1/4`): the date is then its next
 * occurrence on or after `today`. A year, when typed, must have four digits.
 */
import { parseIsoDate, toIsoDate } from "../Calendar/date-grid";

const SEPARATORS = /[\s,./-]+/;
const DIGITS = /^\d{1,4}$/;
/** A leap day typed without a year is at most eight years away. */
const YEARS_TO_SEARCH = 8;

interface DayOfYear {
  readonly month: number; // 1-12
  readonly day: number;
  readonly year: number | null;
}

function normalise(word: string): string {
  return word.toLocaleLowerCase().replace(/\.$/, "");
}

/** 1-12 for a short or long month name in `locale`, or `null`. */
function monthFromName(word: string, locale: string | undefined): number | null {
  const wanted = normalise(word);
  const formats = (["short", "long"] as const).map(
    (month) => new Intl.DateTimeFormat(locale, { month, timeZone: "UTC" })
  );
  for (let month = 0; month < 12; month += 1) {
    const date = new Date(Date.UTC(2023, month, 1));
    if (formats.some((format) => normalise(format.format(date)) === wanted)) return month + 1;
  }
  return null;
}

/** Whether `locale` writes the day before the month in a numeric date. */
function dayComesFirst(locale: string | undefined): boolean {
  const parts = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" })
    .formatToParts(new Date(Date.UTC(2023, 0, 2)))
    .map((part) => part.type);
  return parts.indexOf("day") < parts.indexOf("month");
}

function withNamedMonth(
  numbers: readonly string[],
  word: string,
  locale: string | undefined
): DayOfYear | null {
  const month = monthFromName(word, locale);
  const years = numbers.filter((token) => token.length === 4);
  const days = numbers.filter((token) => token.length <= 2);
  const day = days[0];
  if (month === null || day === undefined || days.length !== 1 || years.length > 1) return null;
  if (days.length + years.length !== numbers.length) return null;
  return { month, day: Number(day), year: years[0] === undefined ? null : Number(years[0]) };
}

function numeric(numbers: readonly string[], locale: string | undefined): DayOfYear | null {
  const [first, second, third] = numbers;
  if (first === undefined || second === undefined) return null;
  if (first.length === 4) {
    if (third === undefined || second.length > 2 || third.length > 2) return null;
    return { year: Number(first), month: Number(second), day: Number(third) };
  }
  if (first.length > 2 || second.length > 2) return null;
  if (third !== undefined && third.length !== 4) return null;
  const [day, month] = dayComesFirst(locale) ? [first, second] : [second, first];
  return {
    month: Number(month),
    day: Number(day),
    year: third === undefined ? null : Number(third),
  };
}

function read(text: string, locale: string | undefined): DayOfYear | null {
  const tokens = text.trim().split(SEPARATORS).filter(Boolean);
  const numbers = tokens.filter((token) => DIGITS.test(token));
  const words = tokens.filter((token) => !DIGITS.test(token));
  if (numbers.length === 0 || numbers.length > 3 || words.length > 1) return null;
  const word = words[0];
  if (word !== undefined) return numbers.length > 2 ? null : withNamedMonth(numbers, word, locale);
  return numeric(numbers, locale);
}

/** The ISO date for these parts, or `null` when no such day exists. */
function realDate(year: number, month: number, day: number): string | null {
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = toIsoDate(year, month - 1, day);
  const parts = parseIsoDate(iso);
  return parts && parts.month === month && parts.day === day ? iso : null;
}

function nextOccurrence(month: number, day: number, today: string): string | null {
  const start = parseIsoDate(today)?.year;
  if (start === undefined) return null;
  for (let offset = 0; offset < YEARS_TO_SEARCH; offset += 1) {
    const iso = realDate(start + offset, month, day);
    if (iso !== null && iso >= today) return iso;
  }
  return null;
}

/**
 * Read `text` as one date in `locale`. Returns a `yyyy-mm-dd` string, or `null`
 * when the text is empty, ambiguous, malformed, or names a day that does not
 * exist. `today` (`yyyy-mm-dd`) anchors a date typed without a year.
 */
export function parseTypedDate(
  text: string,
  locale: string | undefined,
  today: string
): string | null {
  try {
    const parts = read(text, locale);
    if (!parts) return null;
    return parts.year === null
      ? nextOccurrence(parts.month, parts.day, today)
      : realDate(parts.year, parts.month, parts.day);
  } catch {
    // Intl rejects a malformed locale tag; an unreadable date is not an error.
    return null;
  }
}
