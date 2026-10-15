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
 * Format an ISO datetime string as 12-hour time with minutes (e.g. "2:30 PM").
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
 * matters, e.g. guest-facing booking flows (#4976), never mutating
 * `formatTime` itself since Timeline/ReservationBlock intentionally want
 * device-local.
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
 * Format an amount in cents as a localized currency string (e.g. "$10.00").
 * Currency code is case-insensitive; it will be uppercased internally.
 *
 * Used by: PaymentStep, StaffDepositSection, ConfirmationView
 */
export function formatCurrencyFromCents(
  amountCents: number,
  currency: string,
  locale: string = LOCALE
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
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
