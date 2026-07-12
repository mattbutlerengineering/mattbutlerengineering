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
} from "../Calendar/date-grid";
import styles from "./DateRange.module.css";

/* ── Date ⇆ ISO boundary ────────────────────────────────────────────────────
 * The public API speaks in `Date` objects (per the API decision), while the
 * shared grid machinery is ISO-string based. Conversions use the *local*
 * calendar date (year/month/day), matching `localToday()` — no timezone math
 * crosses the boundary. */

function dateToIso(date: Date | null | undefined): string | null {
  if (!date) return null;
  return toIsoDate(date.getFullYear(), date.getMonth(), date.getDate());
}

function isoToDate(iso: string): Date {
  const parts = parseIsoDate(iso) ?? { year: 1970, month: 1, day: 1 };
  return new Date(parts.year, parts.month - 1, parts.day);
}

/** A selected date range. Either endpoint may be `null` while a range is being picked. */
export interface DateRangeValue {
  readonly start: Date | null;
  readonly end: Date | null;
}

/* ── Component ─────────────────────────────────────────────────────────────── */

export interface DateRangeProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** The selected range. `end` is `null` while the second endpoint is being picked. */
  value: DateRangeValue;
  /** Called with the next range. Endpoints are always ordered (`start` ≤ `end`). */
  onChange: (value: DateRangeValue) => void;
  /** Earliest selectable date (inclusive). */
  min?: Date;
  /** Latest selectable date (inclusive). */
  max?: Date;
  /**
   * Predicate deciding whether a date is disabled. When supplied it is
   * authoritative and wins over `min`/`max`; range bounds apply only when no
   * predicate is given.
   */
  isDateDisabled?: (date: Date) => boolean;
  /** BCP-47 locale for month/weekday labels. */
  locale?: string;
  /** First day of the week, 0 (Sunday) … 6. Defaults to the locale, then Monday. */
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

function initialMonth(startIso: string | null, today: string): CalendarMonth {
  return startIso ? monthOfIso(startIso) : monthOfIso(today);
}

function initialFocus(startIso: string | null, month: CalendarMonth, today: string): string {
  if (startIso) return startIso;
  const todayMonth = monthOfIso(today);
  if (todayMonth.year === month.year && todayMonth.month === month.month) return today;
  return toIsoDate(month.year, month.month, 1);
}

export const DateRange = forwardRef<HTMLDivElement, DateRangeProps>(function DateRange(
  { value, onChange, min, max, isDateDisabled, locale, weekStartsOn, className, ...rest },
  ref
) {
  const gridRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef(false);
  const dir = useDirection(gridRef);
  const today = localToday();

  const startIso = dateToIso(value.start);
  const endIso = dateToIso(value.end);
  const minIso = dateToIso(min);
  const maxIso = dateToIso(max);

  const weekStart = resolveWeekStart(locale, weekStartsOn);

  // Visible month is derived once (lazy init) then changed only in event
  // handlers — never synced from a `useEffect` body (a Rialto rendering rule).
  const [visibleMonth, setVisibleMonth] = useState<CalendarMonth>(() =>
    initialMonth(startIso, today)
  );
  const [focusedDate, setFocusedDate] = useState<string>(() =>
    initialFocus(startIso, initialMonth(startIso, today), today)
  );
  // The hovered day drives the in-progress range preview (mouse); keyboard nav
  // falls back to `focusedDate`.
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const isDisabled = useCallback(
    (iso: string): boolean => {
      if (isDateDisabled) return isDateDisabled(isoToDate(iso));
      if (minIso && iso < minIso) return true;
      if (maxIso && iso > maxIso) return true;
      return false;
    },
    [isDateDisabled, minIso, maxIso]
  );

  // Move DOM focus onto the roving day only after a keyboard navigation — a
  // mount-guarded effect (never requestAnimationFrame, which testing-library
  // does not await). No setState here, per the Rialto rule.
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
      // Fresh selection when nothing is picked yet, or a complete range exists.
      if (!startIso || endIso) {
        onChange({ start: isoToDate(iso), end: null });
        return;
      }
      // Second endpoint — order so start ≤ end (same-day range allowed).
      const [lo, hi] = startIso <= iso ? [startIso, iso] : [iso, startIso];
      onChange({ start: isoToDate(lo), end: isoToDate(hi) });
    },
    [isDisabled, startIso, endIso, onChange]
  );

  const goToMonth = useCallback(
    (delta: number) => {
      const next = addMonthsToMonth(visibleMonth, delta);
      const parts = parseIsoDate(focusedDate) ?? { year: next.year, month: next.month + 1, day: 1 };
      const day = Math.min(parts.day, daysInMonth(next.year, next.month));
      setVisibleMonth(next);
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

  // Committed range (drives aria-selected), always normalised start ≤ end.
  const committed = normaliseRange(startIso, endIso);
  const selLo = committed?.lo ?? null;
  const selHi = committed?.hi ?? null;

  // While picking the end, preview the span from start to the hovered/focused day.
  const inProgress = Boolean(startIso) && !endIso;
  const previewEnd = inProgress ? (hoveredDate ?? focusedDate) : null;
  let hlLo = selLo;
  let hlHi = selHi;
  if (inProgress && startIso && previewEnd && !isDisabled(previewEnd)) {
    hlLo = startIso <= previewEnd ? startIso : previewEnd;
    hlHi = startIso <= previewEnd ? previewEnd : startIso;
  }

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
        aria-multiselectable="true"
        className={styles.monthGrid}
        onKeyDown={handleKeyDown}
        onMouseLeave={() => setHoveredDate(null)}
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
              const selected = selLo !== null && selHi !== null && iso >= selLo && iso <= selHi;
              const inHighlight = hlLo !== null && hlHi !== null && iso >= hlLo && iso <= hlHi;
              const isStart = inHighlight && iso === hlLo;
              const isEnd = inHighlight && iso === hlHi;
              const isMid = inHighlight && !isStart && !isEnd;
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
                    isMid && styles.inRange,
                    isStart && styles.rangeStart,
                    isEnd && styles.rangeEnd,
                    disabled && styles.dayDisabled,
                    isToday && styles.dayToday
                  )}
                  onClick={() => selectDay(iso)}
                  onMouseEnter={() => setHoveredDate(iso)}
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

/** Normalise two optional ISO endpoints into an ordered `{ lo, hi }`, or `null`. */
function normaliseRange(
  startIso: string | null,
  endIso: string | null
): { lo: string; hi: string } | null {
  if (startIso && endIso) {
    return startIso <= endIso ? { lo: startIso, hi: endIso } : { lo: endIso, hi: startIso };
  }
  if (startIso) return { lo: startIso, hi: startIso };
  return null;
}

DateRange.displayName = "DateRange";
