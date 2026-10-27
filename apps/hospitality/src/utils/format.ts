/**
 * Shared date, time, and currency formatters for hospitality components.
 * All formatters are pure functions — no side effects, no global state.
 */

const LOCALE = "en-US";

/**
 * Every formatter takes an explicit BCP-47 `locale` (default en-US). Currency and
 * time zone always come from the venue; locale only picks the notation.
 */

const warnedZones = new Set<string>();

function defaultReport(timeZone: string): void {
  console.warn(`Invalid IANA time zone "${timeZone}"; falling back to the device zone.`);
}

/**
 * Return `timeZone` if it is a valid IANA zone, else `undefined` (device zone),
 * reporting each bad value once.
 */
export function resolveTimeZone(
  timeZone: string | undefined,
  report: (timeZone: string) => void = defaultReport
): string | undefined {
  if (!timeZone) return undefined;
  try {
    new Intl.DateTimeFormat(LOCALE, { timeZone });
    return timeZone;
  } catch {
    if (!warnedZones.has(timeZone)) {
      warnedZones.add(timeZone);
      report(timeZone);
    }
    return undefined;
  }
}

/** Test seam: forget which bad zones were already reported. */
export function resetTimeZoneReports(): void {
  warnedZones.clear();
}

/**
 * Format a YYYY-MM-DD date string as "Weekday, Month Day" (no year).
 * Appends T00:00:00 before constructing the Date to avoid UTC-offset date shifts.
 *
 * Used by: TimeSlotPicker, GuestDetailsForm
 */
export function formatLongDate(dateStr: string, locale: string = LOCALE): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format a YYYY-MM-DD date string as "Weekday, Month Day, Year".
 * Appends T00:00:00 before constructing the Date to avoid UTC-offset date shifts.
 *
 * Used by: ConfirmationView
 */
export function formatLongDateWithYear(dateStr: string, locale: string = LOCALE): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a YYYY-MM-DD date string as "Weekday, Mon Day" (e.g. "Tuesday, Sep 3") — the
 * service-night label ux.md uses in empty states and load announcements.
 * Appends T00:00:00 before constructing the Date to avoid UTC-offset date shifts.
 *
 * Used by: BriefingPage, ReservationsPage
 */
export function formatServiceDate(dateStr: string, locale: string = LOCALE): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(locale, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format any instant with caller-chosen `Intl` fields. `timeZone` (a venue's IANA zone)
 * pins the clock; absent or invalid falls back to the device zone. The one door for
 * display dates/times outside the fixed shapes above — components never call `Intl` or
 * `toLocale*String` themselves.
 */
export function formatInstant(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions,
  locale: string = LOCALE,
  timeZone?: string
): string {
  const date = new Date(value);
  // `Intl` throws on an invalid date where `toLocale*String` printed "Invalid Date"; a
  // malformed SSE/API timestamp must degrade to a bad label, not crash the handler.
  if (Number.isNaN(date.getTime())) return "Invalid Date";
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: resolveTimeZone(timeZone),
  }).format(date);
}

/**
 * Format a calendar date (`YYYY-MM-DD`, or an ISO string for that day's UTC midnight) with
 * caller-chosen fields. A date is not an instant, so it is pinned to UTC and prints the
 * same day in every device and venue zone.
 */
export function formatCalendarDate(
  dateStr: string,
  options: Intl.DateTimeFormatOptions,
  locale: string = LOCALE
): string {
  return formatInstant(`${dateStr.slice(0, 10)}T00:00:00Z`, options, locale, "UTC");
}

/**
 * Format an ISO datetime string as time with minutes (e.g. "2:30 PM" in en-US), in the
 * viewer's device timezone. Staff screens use the venue-zone `formatTimeIn` (via
 * `useVenueFormat`) instead; this is the fallback when no venue zone is known.
 *
 * Used by: TimeSlotPicker, GuestDetailsForm, ConfirmationView,
 *          TimelineMobileView, ReservationBlock
 */
export function formatTime(isoString: string, locale: string = LOCALE): string {
  return new Date(isoString).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Format an ISO datetime string as 12-hour time with minutes, in the given
 * IANA timezone (e.g. "2:30 PM"). Sibling to `formatTime`, which uses the
 * viewer's device timezone — use this wherever the *venue's* clock is what
 * matters: booking flows (#4976) and, through `useVenueFormat`, staff screens.
 *
 * Used by: TimeSlotPicker, TimeSlotListbox, GuestDetailsForm, ConfirmationView
 */
export function formatTimeIn(isoString: string, timeZone: string, locale: string = LOCALE): string {
  return new Date(isoString).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: resolveTimeZone(timeZone),
  });
}

/**
 * Hour-of-day (0-23) for an ISO datetime string in the given IANA timezone.
 * Used by TimeSlotPicker to group slots into Lunch/Dinner/Late buckets by
 * the venue's clock rather than the guest's device.
 *
 * Used by: TimeSlotPicker
 */
export function getHourIn(isoString: string, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: resolveTimeZone(timeZone),
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(new Date(isoString))
    .find((part) => part.type === "hour")?.value;
  return hour ? Number(hour) : 0;
}

/**
 * Format a venue-local "HH:MM" wall-clock string as 12-hour time with minutes
 * (e.g. "17:00" → "5:00 PM"). The value is a wall-clock, not an instant, so it
 * is pinned to UTC and formats identically on every machine.
 *
 * Used by: formatVenueOpenLabel
 */
export function formatLocalTime(hhmm: string, locale: string = LOCALE): string {
  const [hours = 0, minutes = 0] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(1970, 0, 1, hours, minutes)).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * A whole wall-clock hour with no minutes (18 → "6 PM" in en-US, "18 h" in fr-CA). Pinned
 * to UTC like `formatLocalTime`, so it prints the same on every machine.
 *
 * Used by: BriefingPage time-segment filter labels
 */
export function formatWallHour(hour24: number, locale: string = LOCALE): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(1970, 0, 1, hour24))
  );
}

/** Two whole wall-clock hours as one range, collapsing a shared day period (18, 21 → "6–9 PM"). */
export function formatWallHourRange(
  fromHour24: number,
  toHour24: number,
  locale: string = LOCALE
): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", timeZone: "UTC" }).formatRange(
    new Date(Date.UTC(1970, 0, 1, fromHour24)),
    new Date(Date.UTC(1970, 0, 1, toHour24))
  );
}

/**
 * Digits after the decimal point for a currency's minor unit (USD/CAD 2, JPY/KRW 0,
 * KWD 3), from the runtime's ISO 4217 data. Stripe amounts are in this minor unit.
 */
export function currencyMinorUnits(currency: string): number {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).resolvedOptions().maximumFractionDigits as number;
}

/** The currency's narrow symbol in `locale` ("$", "¥"). */
export function currencySymbol(currency: string, locale: string = LOCALE): string {
  const parts = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    currencyDisplay: "narrowSymbol",
  }).formatToParts(0);
  return parts.find((part) => part.type === "currency")?.value ?? currency.toUpperCase();
}

/** A major-unit amount typed by staff ("25", "2500") as the currency's integer minor units. */
export function majorToMinorUnits(amount: number, currency: string): number {
  return Math.round(amount * 10 ** currencyMinorUnits(currency));
}

/**
 * Format an amount in a currency's minor units (cents for USD, yen for JPY) as a
 * localized currency string (e.g. "$10.00", "¥2,500"). Currency code is
 * case-insensitive; it will be uppercased internally.
 *
 * Used by: PaymentStep, StaffDepositSection, ConfirmationView
 */
export function formatCurrencyFromCents(
  amountMinor: number,
  currency: string,
  locale: string = LOCALE
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountMinor / 10 ** currencyMinorUnits(currency));
}

/**
 * A currency's display name in `locale` ("US Dollar", "peso mexicano"). Falls back to the ISO code
 * when the runtime has no name for it. Display-only — never use it for amounts.
 */
export function formatCurrencyName(currency: string, locale: string = LOCALE): string {
  const code = currency.toUpperCase();
  return new Intl.DisplayNames(locale, { type: "currency" }).of(code) ?? code;
}

/**
 * Format a YYYY-MM-DD date string in the locale's numeric short form
 * (en-US "03/15/2024", en-GB "15/03/2024").
 */
export function formatShortDate(dateStr: string, locale: string = LOCALE): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * The header over an hour column: "7 PM" in en-US, "19 h" in fr-CA. `compact` keeps only the hour
 * digits for the narrow phone grid. A wall-clock hour carries no zone, so it is formatted on a
 * fixed UTC instant — never shifted by the viewer's or the venue's offset.
 */
export function formatHourLabel(hour: number, locale: string, compact: boolean): string {
  const formatter = new Intl.DateTimeFormat(locale, { hour: "numeric", timeZone: "UTC" });
  const instant = new Date(Date.UTC(1970, 0, 1, hour));
  if (!compact) return formatter.format(instant);
  return formatter.formatToParts(instant).find((part) => part.type === "hour")?.value ?? "";
}

/** The device's IANA zone, or "" when the runtime cannot say. */
export function deviceTimeZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
}

/** A zone's generic name in the viewer's language ("Pacific Time"). */
export function formatTimeZoneName(at: Date, timeZone: string, locale: string): string {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone,
    timeZoneName: "longGeneric",
  }).formatToParts(at);
  return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
}
