import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useOptionalVenue } from "../contexts/venue-context-object.js";
import {
  formatCurrencyFromCents,
  formatInstant,
  formatLocalTime,
  formatLongDate,
  formatLongDateWithYear,
  formatServiceDate,
  formatShortDate,
  formatTimeIn,
} from "../utils/format.js";

/** The venue fields formatting depends on (a `Venue` or the widget's venue config). */
export interface VenueFormatSource {
  readonly ianaTimezone: string;
  readonly currencyCode: string;
}

export interface VenueFormat {
  readonly locale: string;
  readonly timeZone: string;
  readonly currency: string;
  /** Venue-clock time from an ISO instant. */
  formatTime(isoString: string): string;
  /** Cents in the venue's currency. */
  formatMoney(amountCents: number): string;
  formatLongDate(dateStr: string): string;
  formatLongDateWithYear(dateStr: string): string;
  formatServiceDate(dateStr: string): string;
  formatShortDate(dateStr: string): string;
  /** Any instant with caller-chosen `Intl` fields, on the venue clock. */
  formatInstant(value: string | number | Date, options: Intl.DateTimeFormatOptions): string;
  /** Venue-local "HH:MM" wall-clock string (an opening hour, not an instant). */
  formatLocalTime(hhmm: string): string;
}

/** Used until a venue is selected: device zone, USD (matches the pre-localization defaults). */
const NO_VENUE: VenueFormatSource = { ianaTimezone: "", currencyCode: "USD" };

/**
 * Binds the active i18n language (notation only) to the venue's time zone and
 * currency (always venue-owned) so components never pass them by hand. Staff
 * screens omit `venue` and get the selected venue; the widget passes its config.
 */
export function useVenueFormat(venue?: VenueFormatSource | null): VenueFormat {
  const { i18n } = useTranslation();
  const selected = useOptionalVenue()?.selectedVenue;
  const locale = i18n.language;
  const { ianaTimezone: timeZone, currencyCode: currency } = venue ?? selected ?? NO_VENUE;

  return useMemo(
    () => ({
      locale,
      timeZone,
      currency,
      formatTime: (iso) => formatTimeIn(iso, timeZone, locale),
      formatMoney: (cents) => formatCurrencyFromCents(cents, currency, locale),
      formatLongDate: (d) => formatLongDate(d, locale),
      formatLongDateWithYear: (d) => formatLongDateWithYear(d, locale),
      formatServiceDate: (d) => formatServiceDate(d, locale),
      formatShortDate: (d) => formatShortDate(d, locale),
      formatInstant: (value, options) => formatInstant(value, options, locale, timeZone),
      formatLocalTime: (hhmm) => formatLocalTime(hhmm, locale),
    }),
    [locale, timeZone, currency]
  );
}
