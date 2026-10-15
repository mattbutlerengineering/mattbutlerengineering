import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  formatCurrencyFromCents,
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
}

/**
 * Binds the active i18n language (notation only) to the venue's time zone and
 * currency (always venue-owned) so components never pass them by hand.
 */
export function useVenueFormat(venue: VenueFormatSource): VenueFormat {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const { ianaTimezone: timeZone, currencyCode: currency } = venue;

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
    }),
    [locale, timeZone, currency]
  );
}
