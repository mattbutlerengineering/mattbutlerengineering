import { forwardRef, useCallback, useEffect, useRef, useState, type HTMLAttributes } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRialtoLocale } from "../../i18n/RialtoLocaleProvider";
import { useDirection } from "../../hooks/useDirection";
import { cn } from "../../utils/class-composer";
import {
  addDays,
  addMonthsToIso,
  addMonthsToMonth,
  boundIso,
  buildWeeks,
  clampIsoToBounds,
  daysInMonth,
  localToday,
  monthIntersectsBounds,
  monthLabel,
  monthOfIso,
  openingAnchor,
  parseIsoDate,
  resolveWeekStart,
  startOfWeek,
  toIsoDate,
  weekdayLabels,
  type CalendarMonth,
} from "./date-grid";
import styles from "./Calendar.module.css";

// Re-export the shared ISO helpers/types consumed elsewhere (e.g. DatePicker).
export { parseIsoDate };
export type { CalendarMonth };

/* ── Component ─────────────────────────────────────────────────────────────── */

/**
 * Inline, locale-aware month grid for single-date selection. Controlled via
 * an ISO `yyyy-mm-dd` string — no `Date` objects cross the public boundary.
 * `DatePicker` and `DateRange` share this same ISO-string vocabulary, per
 * ADR-024 (`docs/adr/ADR-024-date-value-vocabulary.md`), which unifies the
 * value contract across all three date components.
 *
 * @example
 * const [date, setDate] = useState<string | null>(null);
 * <Calendar value={date} onChange={setDate} />
 */
export interface CalendarProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Currently selected date as a `yyyy-mm-dd` ISO string, or `null` when empty. */
  value: string | null;
  /** Called with the newly selected date (`yyyy-mm-dd`). */
  onChange: (value: string | null) => void;
  /** Earliest selectable date (`yyyy-mm-dd`, inclusive). */
  min?: string;
  /** Latest selectable date (`yyyy-mm-dd`, inclusive). */
  max?: string;
  /**
   * Predicate deciding whether a date is disabled. When supplied it is
   * authoritative and wins over `min`/`max`; range bounds apply only when no
   * predicate is given.
   */
  isDateDisabled?: (isoDate: string) => boolean;
  /**
   * Optional accessible name for a day (`yyyy-mm-dd` in), e.g. why a date is
   * closed. Returning `undefined` leaves the day with its number as the name.
   * A labelled disabled day stays focusable so the label can be reached.
   */
  getDateLabel?: (isoDate: string) => string | undefined;
  /**
   * A date (`yyyy-mm-dd`) whose month the grid opens on when `value` is empty,
   * e.g. the start date for an end-date calendar. The roving focus starts on
   * that date. Read once, when the calendar mounts.
   */
  defaultMonth?: string;
  /** BCP-47 locale for month/weekday labels. */
  locale?: string;
  /** First day of the week, 0 (Sunday) … 6. Defaults to the locale, then Monday. */
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

function initialFocus(value: string | null, month: CalendarMonth, today: string): string {
  if (value && parseIsoDate(value)) return value;
  const todayMonth = monthOfIso(today);
  if (todayMonth.year === month.year && todayMonth.month === month.month) return today;
  return toIsoDate(month.year, month.month, 1);
}

export const Calendar = forwardRef<HTMLDivElement, CalendarProps>(function Calendar(
  {
    value,
    onChange,
    min,
    max,
    isDateDisabled,
    getDateLabel,
    defaultMonth,
    locale: localeProp,
    weekStartsOn,
    className,
    ...rest
  },
  ref
) {
  const gridRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef(false);
  const dir = useDirection(gridRef);
  const today = localToday();

  const { locale: contextLocale, messages } = useRialtoLocale();
  const locale = localeProp ?? contextLocale;
  const weekStart = resolveWeekStart(locale, weekStartsOn);

  // The visible month is derived once (lazy init) and thereafter changed only in
  // event handlers — never synced from a `useEffect` body.
  // With no value, open on today clamped into [min, max] so the grid is not a
  // month of disabled days. A future min wins over a past max (an inverted
  // range still opens on min). An isDateDisabled predicate replaces max for
  // that guess, but a future min still names the month — a "To" field after a
  // chosen "From". An explicit defaultMonth wins over the guess, and a
  // selected date wins over both.
  const minIso = boundIso(min);
  const maxIso = boundIso(max);
  // A predicate replaces min/max for which days, and therefore which months,
  // can be reached. Day disabling already treats the predicate as authoritative.
  const rangeMin = isDateDisabled ? null : minIso;
  const rangeMax = isDateDisabled ? null : maxIso;
  const validIso = (iso: string | null | undefined) => (iso && parseIsoDate(iso) ? iso : null);
  const opening =
    validIso(value) ??
    validIso(defaultMonth) ??
    openingAnchor(today, minIso, maxIso, Boolean(isDateDisabled));
  const [visibleMonth, setVisibleMonth] = useState<CalendarMonth>(() =>
    monthOfIso(opening ?? today)
  );
  const [focusedDate, setFocusedDate] = useState<string>(() =>
    initialFocus(opening, monthOfIso(opening ?? today), today)
  );

  const isDisabled = useCallback(
    (iso: string): boolean => {
      if (isDateDisabled) return isDateDisabled(iso);
      if (min && iso < min) return true;
      if (max && iso > max) return true;
      return false;
    },
    [isDateDisabled, min, max]
  );

  // Move DOM focus onto the roving day only after a keyboard navigation — a
  // mount-guarded effect (never requestAnimationFrame, which testing-library
  // does not await).
  useEffect(() => {
    if (!pendingFocusRef.current) return;
    pendingFocusRef.current = false;
    const target = gridRef.current?.querySelector<HTMLElement>(`[data-date="${focusedDate}"]`);
    target?.focus();
  }, [focusedDate]);

  const selectDay = useCallback(
    (iso: string) => {
      if (isDisabled(iso)) return;
      setFocusedDate(iso);
      onChange(iso);
    },
    [isDisabled, onChange]
  );

  const goToMonth = useCallback(
    (delta: number) => {
      const next = addMonthsToMonth(visibleMonth, delta);
      if (!monthIntersectsBounds(next, rangeMin, rangeMax)) return;
      const parts = parseIsoDate(focusedDate) ?? { year: next.year, month: next.month + 1, day: 1 };
      const day = Math.min(parts.day, daysInMonth(next.year, next.month));
      // Keep the roving day inside the new month, and inside the range, without
      // stealing DOM focus.
      const landed = clampIsoToBounds(toIsoDate(next.year, next.month, day), rangeMin, rangeMax);
      setVisibleMonth(monthOfIso(landed));
      setFocusedDate(landed);
    },
    [visibleMonth, focusedDate, rangeMin, rangeMax]
  );

  const moveFocus = useCallback(
    (next: string) => {
      const landed = clampIsoToBounds(next, rangeMin, rangeMax);
      pendingFocusRef.current = true;
      setFocusedDate(landed);
      setVisibleMonth((current) => {
        const target = monthOfIso(landed);
        return target.year === current.year && target.month === current.month ? current : target;
      });
    },
    [rangeMin, rangeMax]
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const forward = dir === "rtl" ? -1 : 1;
    let next: string;

    switch (event.key) {
      case "ArrowRight":
        next = addDays(focusedDate, forward);
        break;
      case "ArrowLeft":
        next = addDays(focusedDate, -forward);
        break;
      case "ArrowDown":
        next = addDays(focusedDate, 7);
        break;
      case "ArrowUp":
        next = addDays(focusedDate, -7);
        break;
      case "Home":
        next = startOfWeek(focusedDate, weekStart);
        break;
      case "End":
        next = addDays(startOfWeek(focusedDate, weekStart), 6);
        break;
      case "PageUp":
        next = addMonthsToIso(focusedDate, -1);
        break;
      case "PageDown":
        next = addMonthsToIso(focusedDate, 1);
        break;
      default:
        return;
    }

    event.preventDefault();
    moveFocus(next);
  };

  const weekdays = weekdayLabels(locale, weekStart);
  const weeks = buildWeeks(visibleMonth, weekStart);
  const label = monthLabel(visibleMonth, locale);
  const previousDisabled = !monthIntersectsBounds(
    addMonthsToMonth(visibleMonth, -1),
    rangeMin,
    rangeMax
  );
  const nextDisabled = !monthIntersectsBounds(
    addMonthsToMonth(visibleMonth, 1),
    rangeMin,
    rangeMax
  );

  return (
    <div ref={ref} className={cn(styles.calendar, className)} {...rest}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.navButton}
          onClick={() => goToMonth(-1)}
          aria-label={messages.previousMonth}
          disabled={previousDisabled}
          aria-disabled={previousDisabled || undefined}
          // In an overlay's focus trap, opening focus belongs on the roving day.
          data-focus-trap-skip-initial="true"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span className={styles.monthLabel} aria-live="polite">
          {label}
        </span>
        <button
          type="button"
          className={styles.navButton}
          onClick={() => goToMonth(1)}
          aria-label={messages.nextMonth}
          disabled={nextDisabled}
          aria-disabled={nextDisabled || undefined}
          data-focus-trap-skip-initial="true"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      <div
        ref={gridRef}
        role="grid"
        tabIndex={-1}
        aria-label={label}
        className={styles.monthGrid}
        onKeyDown={handleKeyDown}
      >
        <div role="row" className={styles.weekdays}>
          {weekdays.map((weekday) => (
            <span
              key={weekday.long}
              role="columnheader"
              aria-label={weekday.long}
              className={styles.weekday}
            >
              {weekday.short}
            </span>
          ))}
        </div>

        {weeks.map((week) => (
          <div role="row" key={week[0]} className={styles.week}>
            {week.map((iso) => {
              const inMonth = monthOfIso(iso).month === visibleMonth.month;
              const selected = value === iso;
              const disabled = isDisabled(iso);
              const isToday = iso === today;
              const dayNumber = parseIsoDate(iso)?.day ?? 0;

              return (
                <button
                  key={iso}
                  type="button"
                  role="gridcell"
                  data-date={iso}
                  aria-label={getDateLabel?.(iso)}
                  aria-selected={selected}
                  aria-disabled={disabled || undefined}
                  aria-current={isToday ? "date" : undefined}
                  tabIndex={iso === focusedDate ? 0 : -1}
                  className={cn(
                    styles.day,
                    !inMonth && styles.dayOutside,
                    selected && styles.daySelected,
                    disabled && styles.dayDisabled,
                    isToday && styles.dayToday
                  )}
                  onClick={() => selectDay(iso)}
                >
                  {dayNumber}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
});

Calendar.displayName = "Calendar";
