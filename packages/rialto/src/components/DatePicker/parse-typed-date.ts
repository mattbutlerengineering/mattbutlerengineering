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
 * occurrence on or after `today`. A year, when typed, must have four digits
 * and be 1000 or later.
 */
import { parseIsoDate } from "../Calendar/date-grid";

/**
 * Exactly one separator between parts: spaces (after an optional comma or
 * period, as in `Jun 20, 2024` or `20. Juni`), or a single `,` `.` `/` `-`.
 * A doubled or leading separator leaves an empty part, which is refused, so a
 * sign (`-5/3`) never reads as a date.
 */
const SEPARATOR = /[,.]?\s+|[,./-]/;
const DIGITS = /^\d{1,4}$/;
/** Below this, `Date.UTC` rewrites the year (0-99 become 1900-1999). */
const EARLIEST_YEAR = 1000;
/** A leap day typed without a year is at most eight years away. */
const YEARS_TO_SEARCH = 8;

interface DayOfYear {
  readonly month: number; // 1-12
  readonly day: number;
  readonly year: number | null;
}

function normalise(word: string, locale: string | undefined): string {
  return word.toLocaleLowerCase(locale).replace(/\.$/, "");
}

/** 1-12 for a short or long month name in `locale`, or `null`. */
function monthFromName(word: string, locale: string | undefined): number | null {
  const wanted = normalise(word, locale);
  const formats = (["short", "long"] as const).map(
    (month) => new Intl.DateTimeFormat(locale, { month, timeZone: "UTC" })
  );
  for (let month = 0; month < 12; month += 1) {
    const date = new Date(Date.UTC(2023, month, 1));
    if (formats.some((format) => normalise(format.format(date), locale) === wanted))
      return month + 1;
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

/**
 * Sort the parts into a year (the one four-digit number, if any), and the one
 * or two short numbers beside it. An empty part (a doubled or leading
 * separator) counts as a word that names no month, so it is refused.
 */
function read(text: string, locale: string | undefined): DayOfYear | null {
  const tokens = text.trim().split(SEPARATOR);
  const numbers = tokens.filter((token) => DIGITS.test(token));
  const words = tokens.filter((token) => !DIGITS.test(token));
  const years = numbers.filter((token) => token.length === 4);
  const rest = numbers.filter((token) => token.length < 3);
  if (words.length > 1 || years.length > 1 || years.length + rest.length < numbers.length) {
    return null;
  }
  const year = years[0] === undefined ? null : Number(years[0]);
  const [first, second] = rest;
  const word = words[0];
  if (word !== undefined) {
    const month = monthFromName(word, locale);
    if (month === null || first === undefined || second !== undefined) return null;
    return { year, month, day: Number(first) };
  }
  // Numbers only: a year leads (ISO order) or trails (the locale's order), never sits between.
  if (first === undefined || second === undefined || rest.length > 2) return null;
  if (numbers[1] === years[0]) return null;
  const dayFirst = numbers[0] !== years[0] && dayComesFirst(locale);
  return { year, month: Number(dayFirst ? second : first), day: Number(dayFirst ? first : second) };
}

/** The ISO date for these parts, or `null` when no such day exists. */
function realDate(year: number, month: number, day: number): string | null {
  if (year < EARLIEST_YEAR) return null;
  // parseIsoDate refuses a month or day that does not survive the round trip.
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return parseIsoDate(iso) ? iso : null;
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
