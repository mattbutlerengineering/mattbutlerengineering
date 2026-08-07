import { forwardRef, useCallback, useEffect, useRef, useState, type HTMLAttributes } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useDirection } from "../../hooks/useDirection";
import { cn } from "../../utils/class-composer";
import {
  addDays,
  addMonthsToIso,
  addMonthsToMonth,
  buildWeeks,
  daysInMonth,
  localToday,
  monthLabel,
  monthOfIso,
  parseIsoDate,
  resolveWeekStart,
  startOfWeek,
  toIsoDate,
  weekdayLabels,
  type CalendarMonth,
} from "./date-grid";
import styles from "./Calendar.module.css";

// Re-export the shared ISO helpers/types consumed elsewhere (e.g. DatePicker).
export { parseIsoDate, toIsoDate };
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
  { value, onChange, min, max, isDateDisabled, locale, weekStartsOn, className, ...rest },
  ref
) {
  const gridRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef(false);
  const dir = useDirection(gridRef);
  const today = localToday();

  const weekStart = resolveWeekStart(locale, weekStartsOn);

  // The visible month is derived once (lazy init) and thereafter changed only in
  // event handlers — never synced from a `useEffect` body.
  const [visibleMonth, setVisibleMonth] = useState<CalendarMonth>(() =>
    value && parseIsoDate(value) ? monthOfIso(value) : monthOfIso(today)
  );
  const [focusedDate, setFocusedDate] = useState<string>(() =>
    initialFocus(value, value && parseIsoDate(value) ? monthOfIso(value) : monthOfIso(today), today)
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
      const parts = parseIsoDate(focusedDate) ?? { year: next.year, month: next.month + 1, day: 1 };
      const day = Math.min(parts.day, daysInMonth(next.year, next.month));
      setVisibleMonth(next);
      // Keep the roving day inside the new month without stealing DOM focus.
      setFocusedDate(toIsoDate(next.year, next.month, day));
    },
    [visibleMonth, focusedDate]
  );

  const moveFocus = useCallback((next: string) => {
    pendingFocusRef.current = true;
    setFocusedDate(next);
    setVisibleMonth((current) => {
      const target = monthOfIso(next);
      return target.year === current.year && target.month === current.month ? current : target;
    });
  }, []);

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

  return (
    <div ref={ref} className={cn(styles.calendar, className)} {...rest}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.navButton}
          onClick={() => goToMonth(-1)}
          aria-label="Previous month"
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
          aria-label="Next month"
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
