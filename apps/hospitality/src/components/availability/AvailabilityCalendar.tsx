import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@mattbutlerengineering/rialto";
import { addDays } from "@mbe/availability";
import type { AvailabilityDaySummary } from "@mbe/types";
import { useVenueFormat, type VenueFormat } from "../../hooks/useVenueFormat.js";
import { useViewport } from "../../hooks/useViewport.js";
import { shiftAnchor, visibleDates, type CalendarView } from "./calendar-dates.js";
import { columnDates } from "./selection.js";
import { useDateSelection, type DateGestureHandlers } from "./useDateSelection.js";
import { presentDay } from "./day-summary.js";
import { AvailabilityAgenda } from "./AvailabilityAgenda.js";
import styles from "./AvailabilityCalendar.module.css";

export interface AvailabilityCalendarProps {
  readonly view: CalendarView;
  /** The day that holds the single tab stop; the visible range follows it. */
  readonly anchor: string;
  /** Today on the venue clock (`YYYY-MM-DD`). */
  readonly today: string;
  readonly days: readonly AvailabilityDaySummary[] | undefined;
  readonly isLoading: boolean;
  /** The day whose drawer is open. */
  readonly selectedDate?: string | null;
  /** The day whose drawer holds an unsaved draft; its cell shows a dot. */
  readonly draftDate?: string | null;
  /** The dates picked for a bulk edit (ux.md F-MS), in date order. */
  readonly selection: readonly string[];
  readonly onSelectionChange: (dates: string[]) => void;
  readonly onOpenDay: (date: string) => void;
  readonly onAnchorChange: (date: string) => void;
}

interface CellProps {
  readonly date: string;
  readonly summary: AvailabilityDaySummary | undefined;
  readonly isLoading: boolean;
  readonly detailed: boolean;
  readonly isToday: boolean;
  readonly isSelected: boolean;
  readonly isDraft: boolean;
  readonly isPicked: boolean;
  readonly isTabStop: boolean;
  readonly isMuted: boolean;
  readonly format: VenueFormat;
  readonly handlers: DateGestureHandlers;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, date: string) => void;
}

function Cell(props: CellProps) {
  const { date, summary, isLoading, detailed, isToday, isSelected, isPicked, isTabStop } = props;
  const { isMuted, handlers, isDraft } = props;
  const { t } = useTranslation();
  const { format } = props;

  const view = presentDay(date, summary, detailed, t, format);

  const className = [
    styles.cell,
    isMuted ? styles.muted : "",
    isSelected ? styles.selected : "",
    isPicked ? styles.picked : "",
    detailed ? styles.detailed : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div role="gridcell" aria-selected={isPicked} className={styles.dayCell}>
      <button
        type="button"
        className={className}
        data-date={date}
        tabIndex={isTabStop ? 0 : -1}
        aria-current={isToday ? "date" : undefined}
        aria-label={
          isDraft
            ? `${view.accessibleName}, ${t("availability.calendar.draftName")}`
            : view.accessibleName
        }
        {...handlers}
        onKeyDown={(event) => props.onKeyDown(event, date)}
        // Firefox clicks a button on Space keyup; Space toggles selection, so it must not open the day.
        onKeyUp={(event) => {
          if (event.key === " ") event.preventDefault();
        }}
      >
        {isDraft && <span className={styles.draftDot} data-draft-dot aria-hidden="true" />}
        <span className={styles.dayNumber} aria-hidden="true">
          {format.formatCalendarDate(date, { day: "numeric" })}
        </span>
        {isLoading || !summary ? (
          <Skeleton variant="text" width="100%" height={16} />
        ) : (
          <span className={styles.details} aria-hidden="true">
            <span className={styles.label}>{summary.label}</span>
            {view.count && <span className={styles.meta}>{view.count}</span>}
            {view.bands.map((b) => (
              <span key={b.key} className={styles.band}>
                {b.text}
              </span>
            ))}
            {view.onlineOff && (
              <span className={styles.meta}>{t("availability.calendar.onlineOff")}</span>
            )}
          </span>
        )}
      </button>
    </div>
  );
}

/** Where an arrow, Home/End or page key sends the anchor, or null for any other key. */
function targetFor(key: string, date: string): string | null {
  switch (key) {
    case "ArrowLeft":
      return addDays(date, -1);
    case "ArrowRight":
      return addDays(date, 1);
    case "ArrowUp":
      return addDays(date, -7);
    case "ArrowDown":
      return addDays(date, 7);
    case "Home":
      return visibleDates("week", date)[0] ?? null;
    case "End":
      return visibleDates("week", date)[6] ?? null;
    case "PageUp":
      return shiftAnchor("month", date, -1);
    case "PageDown":
      return shiftAnchor("month", date, 1);
    default:
      return null;
  }
}

/**
 * App-local month and week grid (architecture § Components: rialto `Calendar` has no
 * per-day content). Read-only: a cell opens the day drawer. `role="grid"` with a roving
 * tabindex, so the whole grid is one Tab stop.
 */
export function AvailabilityCalendar(props: AvailabilityCalendarProps) {
  const { view, anchor, today, days, isLoading, selectedDate, draftDate } = props;
  const { selection, onAnchorChange } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const gridRef = useRef<HTMLDivElement>(null);
  const focusRequested = useRef(false);

  const dates = useMemo(() => visibleDates(view, anchor), [view, anchor]);
  const byDate = useMemo(() => new Map((days ?? []).map((d) => [d.serviceDate, d])), [days]);
  const anchorMonth = anchor.slice(0, 7);
  const tabStop = dates.includes(anchor) ? anchor : dates[0];

  // After a key moves the anchor, focus follows once its cell has rendered. No state is set here.
  useEffect(() => {
    if (!focusRequested.current) return;
    focusRequested.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${anchor}"]`)?.focus();
  }, [anchor, view]);

  const isMobile = useViewport() !== "desktop";
  const { handlersFor, extendSelection, toggleSelected, pivot } = useDateSelection(props);
  const picked = useMemo(() => new Set(selection), [selection]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: string) => {
    // Enter opens the day; Space toggles it in the selection (ux.md S2).
    if (event.key === " ") {
      event.preventDefault();
      toggleSelected(date);
      return;
    }
    const next = targetFor(event.key, date);
    if (!next) return;
    event.preventDefault();
    // Shift+Arrow is the keyboard twin of Shift-click: grow the range from where it started.
    if (event.shiftKey && event.key.startsWith("Arrow"))
      extendSelection(pivot.current ?? date, next);
    focusRequested.current = true;
    onAnchorChange(next);
  };

  const weeks = Array.from({ length: Math.ceil(dates.length / 7) }, (_, i) =>
    dates.slice(i * 7, i * 7 + 7)
  );

  if (isMobile) {
    // Phone and tablet: a one-row-per-day list of the anchor month (a week view lists its week).
    const listed = view === "month" ? dates.filter((d) => d.startsWith(anchorMonth)) : dates;
    return (
      <AvailabilityAgenda
        dates={listed}
        byDate={byDate}
        today={today}
        selectedDate={selectedDate}
        draftDate={draftDate}
        picked={picked}
        isLoading={isLoading}
        handlersFor={handlersFor}
      />
    );
  }

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label={t("availability.calendar.label")}
      className={styles.calendar}
    >
      <div role="row" className={styles.row}>
        {(weeks[0] ?? []).map((date, column) => (
          <div key={date} role="columnheader" className={styles.columnHeader}>
            <button
              type="button"
              className={styles.columnButton}
              tabIndex={-1}
              aria-label={t("availability.selection.selectColumn", {
                weekday: format.formatCalendarDate(date, { weekday: "long" }),
              })}
              onClick={() => props.onSelectionChange(columnDates(dates, column, view, anchor))}
            >
              {format.formatCalendarDate(date, { weekday: "short" })}
            </button>
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} role="row" className={styles.row}>
          {week.map((date) => (
            <Cell
              key={date}
              date={date}
              summary={byDate.get(date)}
              isLoading={isLoading}
              detailed={view === "week"}
              isToday={date === today}
              isSelected={date === selectedDate}
              isDraft={date === draftDate}
              isPicked={picked.has(date)}
              isTabStop={date === tabStop}
              isMuted={view === "month" && !date.startsWith(anchorMonth)}
              format={format}
              handlers={handlersFor(date)}
              onKeyDown={handleKeyDown}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
