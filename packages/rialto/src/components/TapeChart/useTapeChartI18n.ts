import { useMemo } from "react";
import { parseISODate } from "./dateMath";

export interface TapeChartFormatters {
  /** "Fri" */
  dayWeekdayShort: (iso: string) => string;
  /** "28" */
  dayNumeric: (iso: string) => string;
  /** "Friday, October 28, 2022" — used for aria-labels. */
  dayLong: (iso: string) => string;
  /** "October 2022" — month divider in day header. */
  monthYearLong: (iso: string) => string;
  /** Currency-formatted rate, e.g. "$1,290.00". Pass minor units. */
  currency: (minorUnits: number, currencyCode?: string) => string;
  /** Plain number. */
  number: (n: number) => string;
  /** Locale-correct plural category. */
  pluralCategory: (n: number) => Intl.LDMLPluralRule;
  /** Collator for sorting room names. */
  compare: (a: string, b: string) => number;
  /** Today's ISO date in the chart's time zone. */
  todayISO: () => string;
  locale: string;
  timeZone?: string;
}

export function useTapeChartI18n(
  locale?: string,
  timeZone?: string,
  defaultCurrency?: string
): TapeChartFormatters {
  const effectiveLocale =
    locale ?? (typeof navigator !== "undefined" ? navigator.language : "en-US");

  return useMemo(() => {
    const weekdayShort = new Intl.DateTimeFormat(effectiveLocale, {
      weekday: "short",
      timeZone,
    });
    const dayNumeric = new Intl.DateTimeFormat(effectiveLocale, {
      day: "2-digit",
      timeZone,
    });
    const dayLong = new Intl.DateTimeFormat(effectiveLocale, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone,
    });
    const monthYearLong = new Intl.DateTimeFormat(effectiveLocale, {
      month: "long",
      year: "numeric",
      timeZone,
    });
    const todayParts = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone,
    });
    const numberFmt = new Intl.NumberFormat(effectiveLocale);
    const plural = new Intl.PluralRules(effectiveLocale);
    const collator = new Intl.Collator(effectiveLocale, { numeric: true, sensitivity: "base" });

    const currencyCache = new Map<string, Intl.NumberFormat>();
    const getCurrency = (code: string) => {
      let fmt = currencyCache.get(code);
      if (!fmt) {
        fmt = new Intl.NumberFormat(effectiveLocale, {
          style: "currency",
          currency: code,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        currencyCache.set(code, fmt);
      }
      return fmt;
    };

    return {
      dayWeekdayShort: (iso) => weekdayShort.format(parseISODate(iso)),
      dayNumeric: (iso) => dayNumeric.format(parseISODate(iso)),
      dayLong: (iso) => dayLong.format(parseISODate(iso)),
      monthYearLong: (iso) => monthYearLong.format(parseISODate(iso)),
      currency: (minorUnits, code) => {
        const c = code ?? defaultCurrency ?? "USD";
        return getCurrency(c).format(minorUnits / 100);
      },
      number: (n) => numberFmt.format(n),
      pluralCategory: (n) => plural.select(n),
      compare: (a, b) => collator.compare(a, b),
      todayISO: () => {
        // en-CA yields YYYY-MM-DD reliably; we then parse parts to be explicit.
        const parts = todayParts.formatToParts(new Date());
        const y = parts.find((p) => p.type === "year")?.value ?? "1970";
        const m = parts.find((p) => p.type === "month")?.value ?? "01";
        const d = parts.find((p) => p.type === "day")?.value ?? "01";
        return `${y}-${m}-${d}`;
      },
      locale: effectiveLocale,
      timeZone,
    };
  }, [effectiveLocale, timeZone, defaultCurrency]);
}
