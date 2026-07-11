import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useDirection } from "../../hooks/useDirection";
import { cn } from "../../utils/class-composer";
import styles from "./Calendar.module.css";

/* ── ISO date helpers (pure, guarded for noUncheckedIndexedAccess) ─────────── */

/** A calendar month, expressed with a zero-based month index (0 = January). */
export interface CalendarMonth {
  readonly year: number;
  readonly month: number;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

/** Parse a `yyyy-mm-dd` string into calendar parts, or `null` when malformed. */
export function parseIsoDate(
  iso: string
): { year: number; month: number; day: number } | null {
  const match = ISO_DATE.exec(iso);
  if (!match) return null;

  const year = Number(match[1] ?? 0);
  const month = Number(match[2] ?? 0); // 1-12 as authored
  const day = Number(match[3] ?? 0);

  // Reject impossible dates (e.g. 2024-02-31) by round-tripping through UTC.
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/** Build a `yyyy-mm-dd` string from year, zero-based month, and day (overflow normalised). */
export function toIsoDate(year: number, month: number, day: number): string {
  const utc = new Date(Date.UTC(year, month, day));
  return `${pad(utc.getUTCFullYear(), 4)}-${pad(utc.getUTCMonth() + 1, 2)}-${pad(
    utc.getUTCDate(),
    2
  )}`;
}

function isoToUtc(iso: string): Date {
  const parts = parseIsoDate(iso);
  const safe = parts ?? { year: 1970, month: 1, day: 1 };
  return new Date(Date.UTC(safe.year, safe.month - 1, safe.day));
}

function addDays(iso: string, delta: number): string {
  const utc = isoToUtc(iso);
  return toIsoDate(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate() + delta);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Add months to an ISO date, clamping the day to the target month's length. */
function addMonthsToIso(iso: string, delta: number): string {
  const parts = parseIsoDate(iso) ?? { year: 1970, month: 1, day: 1 };
  const target = addMonthsToMonth({ year: parts.year, month: parts.month - 1 }, delta);
  const day = Math.min(parts.day, daysInMonth(target.year, target.month));
  return toIsoDate(target.year, target.month, day);
}

function addMonthsToMonth(month: CalendarMonth, delta: number): CalendarMonth {
  const total = month.year * 12 + month.month + delta;
  const year = Math.floor(total / 12);
  return { year, month: total - year * 12 };
}

function monthOfIso(iso: string): CalendarMonth {
  const parts = parseIsoDate(iso) ?? { year: 1970, month: 1, day: 1 };
  return { year: parts.year, month: parts.month - 1 };
}

function startOfWeek(iso: string, weekStartsOn: number): string {
  const lead = (isoToUtc(iso).getUTCDay() - weekStartsOn + 7) % 7;
  return addDays(iso, -lead);
}

/** Build a stable 6-row grid of ISO dates covering the given month. */
function buildWeeks(month: CalendarMonth, weekStartsOn: number): string[][] {
  const gridStart = startOfWeek(toIsoDate(month.year, month.month, 1), weekStartsOn);
  const weeks: string[][] = [];
  let cursor = gridStart;

  for (let week = 0; week < 6; week += 1) {
    const row: string[] = [];
    for (let day = 0; day < 7; day += 1) {
      row.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(row);
  }

  return weeks;
}

/* ── Locale helpers ────────────────────────────────────────────────────────── */

interface WeekInfoLike {
  readonly firstDay: number;
}

/** Resolve the first day of the week (0 = Sunday) from an explicit prop or the locale. */
function resolveWeekStart(locale: string | undefined, weekStartsOn: number | undefined): number {
  if (weekStartsOn !== undefined) return weekStartsOn;

  try {
    const resolved = new Intl.Locale(locale ?? "en-US") as Intl.Locale & {
      readonly weekInfo?: WeekInfoLike;
      readonly getWeekInfo?: () => WeekInfoLike;
    };
    const info =
      typeof resolved.getWeekInfo === "function" ? resolved.getWeekInfo() : resolved.weekInfo;
    if (info && typeof info.firstDay === "number") {
      // Intl reports 1 (Monday) … 7 (Sunday); normalise to 0 (Sunday) … 6.
      return info.firstDay % 7;
    }
  } catch {
    // Fall through to the Monday default for unsupported locales/runtimes.
  }

  return 1; // Monday
}

// A known Sunday, used purely to derive locale-aware weekday labels.
const WEEKDAY_REFERENCE = Date.UTC(2023, 0, 1); // 2023-01-01 is a Sunday.

function weekdayLabels(
  locale: string | undefined,
  weekStartsOn: number
): { short: string; long: string }[] {
  const shortFmt = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const longFmt = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
  const day = 24 * 60 * 60 * 1000;

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(WEEKDAY_REFERENCE + ((weekStartsOn + index) % 7) * day);
    return { short: shortFmt.format(date), long: longFmt.format(date) };
  });
}

function localToday(): string {
  const now = new Date();
  return toIsoDate(now.getFullYear(), now.getMonth(), now.getDate());
}

/* ── Component ─────────────────────────────────────────────────────────────── */

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
  const label = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(visibleMonth.year, visibleMonth.month, 1)));

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
        className={styles.grid}
        onKeyDown={handleKeyDown}
      >
        <div role="row" className={styles.weekdays}>
          {weekdays.map((weekday) => (
            <span key={weekday.long} role="columnheader" aria-label={weekday.long} className={styles.weekday}>
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
