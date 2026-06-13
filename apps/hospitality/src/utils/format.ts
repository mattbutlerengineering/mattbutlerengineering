/**
 * Shared date, time, and currency formatters for hospitality components.
 * All formatters are pure functions — no side effects, no global state.
 */

const LOCALE = "en-US";

/**
 * Format a YYYY-MM-DD date string as "Weekday, Month Day" (no year).
 * Appends T00:00:00 before constructing the Date to avoid UTC-offset date shifts.
 *
 * Used by: TimeSlotPicker, GuestDetailsForm
 */
export function formatLongDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(LOCALE, {
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
export function formatLongDateWithYear(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(LOCALE, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format an ISO datetime string as 12-hour time with minutes (e.g. "2:30 PM").
 *
 * Used by: TimeSlotPicker, GuestDetailsForm, ConfirmationView,
 *          TimelineMobileView, ReservationBlock
 */
export function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString(LOCALE, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Format an amount in cents as a localized currency string (e.g. "$10.00").
 * Currency code is case-insensitive; it will be uppercased internally.
 *
 * Used by: PaymentStep, StaffDepositSection, ConfirmationView
 */
export function formatCurrencyFromCents(amountCents: number, currency: string): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}
