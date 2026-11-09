import { addDays, weekdayIndexOf } from "@mbe/availability";

/**
 * The public holidays and big restaurant days a venue usually plans for, by country, so the
 * Special dates tab can offer the next few before a Manager thinks of them. Pure, no React.
 * Dates are service dates (`YYYY-MM-DD`); weekdays are 0 = Sunday.
 */

export type HolidayCountry = "US" | "CA" | "MX";

export type HolidayId =
  | "newYearsDay"
  | "constitutionDay"
  | "valentinesDay"
  | "benitoJuarez"
  | "holyThursday"
  | "goodFriday"
  | "easter"
  | "workersDay"
  | "mothersDay"
  | "fathersDay"
  | "juneteenth"
  | "victoriaDay"
  | "memorialDay"
  | "canadaDay"
  | "independenceDay"
  | "laborDay"
  | "thanksgiving"
  | "dayOfTheDead"
  | "revolutionDay"
  | "christmasEve"
  | "christmasDay"
  | "boxingDay"
  | "newYearsEve";

export interface Holiday {
  readonly id: HolidayId;
  readonly date: string;
}

const iso = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** The `n`th (1-based) `weekday` of a month; a negative `n` counts from the month's end. */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = iso(year, month, 1);
    return addDays(first, ((weekday - weekdayIndexOf(first) + 7) % 7) + (n - 1) * 7);
  }
  const last = addDays(iso(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1), -1);
  return addDays(last, -((weekdayIndexOf(last) - weekday + 7) % 7) + (n + 1) * 7);
}

/** Western Easter Sunday (the anonymous Gregorian algorithm). */
function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

const MONDAY = 1;
const THURSDAY = 4;
const SUNDAY = 0;

/** One country's holidays in one calendar year, in date order. */
export function holidaysIn(country: HolidayCountry, year: number): Holiday[] {
  const easter = easterSunday(year);
  const at = (id: HolidayId, date: string): Holiday => ({ id, date });
  const common = [
    at("newYearsDay", iso(year, 1, 1)),
    at("valentinesDay", iso(year, 2, 14)),
    at("easter", easter),
    // Third Sunday of June in all three countries.
    at("fathersDay", nthWeekday(year, 6, SUNDAY, 3)),
    at("christmasEve", iso(year, 12, 24)),
    at("christmasDay", iso(year, 12, 25)),
    at("newYearsEve", iso(year, 12, 31)),
  ];
  const own: Record<HolidayCountry, Holiday[]> = {
    US: [
      at("mothersDay", nthWeekday(year, 5, SUNDAY, 2)),
      at("memorialDay", nthWeekday(year, 5, MONDAY, -1)),
      at("juneteenth", iso(year, 6, 19)),
      at("independenceDay", iso(year, 7, 4)),
      at("laborDay", nthWeekday(year, 9, MONDAY, 1)),
      at("thanksgiving", nthWeekday(year, 11, THURSDAY, 4)),
    ],
    CA: [
      at("goodFriday", addDays(easter, -2)),
      at("mothersDay", nthWeekday(year, 5, SUNDAY, 2)),
      // The Monday before May 25.
      at("victoriaDay", addDays(iso(year, 5, 24), -((weekdayIndexOf(iso(year, 5, 24)) + 6) % 7))),
      at("canadaDay", iso(year, 7, 1)),
      at("laborDay", nthWeekday(year, 9, MONDAY, 1)),
      at("thanksgiving", nthWeekday(year, 10, MONDAY, 2)),
      at("boxingDay", iso(year, 12, 26)),
    ],
    MX: [
      at("constitutionDay", nthWeekday(year, 2, MONDAY, 1)),
      at("benitoJuarez", nthWeekday(year, 3, MONDAY, 3)),
      at("holyThursday", addDays(easter, -3)),
      at("goodFriday", addDays(easter, -2)),
      at("workersDay", iso(year, 5, 1)),
      at("mothersDay", iso(year, 5, 10)),
      at("independenceDay", iso(year, 9, 16)),
      at("dayOfTheDead", iso(year, 11, 2)),
      at("revolutionDay", nthWeekday(year, 11, MONDAY, 3)),
    ],
  };
  return [...common, ...own[country]].sort((x, y) => x.date.localeCompare(y.date));
}

/** How far ahead the Close dialog offers holiday chips. */
const CLOSE_CHIP_DAYS = 60;

/**
 * Every holiday from `today` (inclusive) to `days` later, planned ones included: the Close dialog
 * shows an already-closed date its own notice instead of hiding the chip.
 */
export function holidaysWithin(
  country: HolidayCountry,
  today: string,
  days: number = CLOSE_CHIP_DAYS
): Holiday[] {
  const end = addDays(today, days);
  const year = Number(today.slice(0, 4));
  return [...holidaysIn(country, year), ...holidaysIn(country, year + 1)].filter(
    (h) => h.date >= today && h.date <= end
  );
}

const COUNTRIES: readonly HolidayCountry[] = ["US", "CA", "MX"];

/**
 * The venue's country from its profile address, else the region of the language it is run in
 * (en-US, es-MX, fr-CA). `null` for a country this calendar does not know.
 */
export function holidayCountry(
  addressCountry: string | undefined,
  locale: string
): HolidayCountry | null {
  const code = (addressCountry ?? locale.split("-")[1] ?? "").toUpperCase();
  return COUNTRIES.find((c) => c === code) ?? null;
}

/**
 * The holidays most restaurants close for. Plan… starts these as Closed; every other holiday starts
 * from the weekday's usual hours, so planning Valentine's Day without reading cancels nothing.
 */
export const USUALLY_CLOSED: ReadonlySet<HolidayId> = new Set([
  "thanksgiving",
  "christmasDay",
  "newYearsDay",
]);
