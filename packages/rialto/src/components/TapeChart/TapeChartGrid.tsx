import { useMemo, useRef, type CSSProperties, type KeyboardEvent } from "react";
import styles from "./TapeChart.module.css";
import { daysBetween } from "./dateMath";
import { TapeChartDayHeader } from "./TapeChartDayHeader";
import { TapeChartRow } from "./TapeChartRow";
import { nextTapeChartBarId, type TapeChartArrowKey } from "./tapeChartFocus";
import type { TapeChartLayout, TapeChartReservation, TapeChartRoom } from "./types";
import type { TapeChartFormatters } from "./useTapeChartI18n";
import type { ResolvedStrings } from "./defaultStrings";

export interface TapeChartGridProps {
  rooms: TapeChartRoom[];
  layout: TapeChartLayout;
  startDate: string;
  dayWidth: number;
  todayISO: string;
  formatters: TapeChartFormatters;
  strings: ResolvedStrings;
  focusedReservationId: string | null;
  selectedReservationId: string | null;
  onReservationSelect: (r: TapeChartReservation) => void;
  /** Roving tabindex. Arrow keys report the bar that should become the tab stop. */
  onFocusedReservationChange?: (id: string) => void;
}

const ARROW_KEYS = new Set<TapeChartArrowKey>(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

function isArrowKey(key: string): key is TapeChartArrowKey {
  return ARROW_KEYS.has(key as TapeChartArrowKey);
}

/** Show the gold focus ring after an arrow-key move, which is a script focus(). */
function focusWithRing(el: HTMLElement) {
  try {
    el.focus({ focusVisible: true });
  } catch {
    el.focus();
  }
}

export function TapeChartGrid(props: TapeChartGridProps) {
  const {
    rooms,
    layout,
    startDate,
    dayWidth,
    todayISO,
    formatters,
    strings,
    focusedReservationId,
    selectedReservationId,
    onReservationSelect,
    onFocusedReservationChange,
  } = props;

  const scrollerRef = useRef<HTMLDivElement>(null);

  let firstBarId: string | null = null;
  let focusedIsVisible = false;
  for (const room of rooms) {
    for (const bar of layout.barsByRoom.get(room.id) ?? []) {
      if (firstBarId == null) firstBarId = bar.reservation.id;
      if (bar.reservation.id === focusedReservationId) focusedIsVisible = true;
    }
  }
  // Nothing focused yet, or the focused id is no longer on the chart: the first
  // bar in reading order is the one tab stop.
  const activeId = focusedIsVisible ? focusedReservationId : firstBarId;

  const todayOffset = useMemo(() => {
    const offset = daysBetween(startDate, todayISO);
    return offset >= 0 && offset < layout.dayCount ? offset : null;
  }, [startDate, todayISO, layout.dayCount]);

  // Stable reference so TapeChartDayHeader's memo can skip focus/selection re-renders.
  const leadingHeader = useMemo(
    () => (
      <div
        role="columnheader"
        className={styles.roomHeader}
        style={{ position: "sticky", insetInlineStart: 0, zIndex: 3 }}
      >
        <strong>{strings.roomsColumnLabel}</strong>
      </div>
    ),
    [strings.roomsColumnLabel]
  );

  const rootStyle: CSSProperties = {
    ["--tapechart-day-width" as string]: `${dayWidth}px`,
    ["--tapechart-day-count" as string]: layout.dayCount,
  };

  const focusBar = (id: string) => {
    onFocusedReservationChange?.(id);
    const el = scrollerRef.current?.querySelector<HTMLElement>(
      `[data-reservation-id="${CSS.escape(id)}"]`
    );
    if (el && el !== document.activeElement) focusWithRing(el);
  };

  const reservationById = (id: string): TapeChartReservation | null => {
    for (const room of rooms) {
      const match = layout.barsByRoom.get(room.id)?.find((bar) => bar.reservation.id === id);
      if (match) return match.reservation;
    }
    return null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    // Enter and Space on a bar are handled by the button itself. They only
    // activate from here when focus is still on the grid (no bar to tab to).
    if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
      if (!activeId) return;
      const reservation = reservationById(activeId);
      if (!reservation) return;
      event.preventDefault();
      onReservationSelect(reservation);
      focusBar(activeId);
      return;
    }

    if (!isArrowKey(event.key)) return;

    const rows = rooms.map((room) =>
      (layout.barsByRoom.get(room.id) ?? []).map((bar) => ({
        id: bar.reservation.id,
        startOffset: bar.startOffset,
      }))
    );
    const fromTarget =
      event.target instanceof Element
        ? (event.target.closest("[data-reservation-id]")?.getAttribute("data-reservation-id") ??
          null)
        : null;
    const nextId = nextTapeChartBarId(rows, fromTarget ?? activeId, event.key);
    if (!nextId) return;
    event.preventDefault();
    focusBar(nextId);
  };

  return (
    <div
      ref={scrollerRef}
      className={styles.scroller}
      style={rootStyle}
      role="grid"
      aria-label={strings.regionLabel}
      // A tabbable bar is the chart's tab stop (and satisfies
      // scrollable-region-focusable). role=grid still has to be focusable, so
      // the container keeps tabindex=-1 while a bar owns the tab order, and
      // tabindex=0 only when there is no bar to focus.
      tabIndex={activeId == null ? 0 : -1}
      onKeyDown={onKeyDown}
    >
      {/* Day header — spans full grid width (after the room column) */}
      <div
        className={styles.gridBody}
        style={{ ["--tapechart-day-count" as string]: layout.dayCount }}
        role="rowgroup"
      >
        <TapeChartDayHeader
          startDate={startDate}
          dayCount={layout.dayCount}
          formatters={formatters}
          todayISO={todayISO}
          dailyCounts={layout.dailyCounts}
          strings={strings}
          leadingHeader={leadingHeader}
        />

        {rooms.map((room) => {
          const bars = layout.barsByRoom.get(room.id) ?? [];
          return (
            <TapeChartRow
              key={room.id}
              room={room}
              bars={bars}
              laneCount={layout.laneCountByRoom.get(room.id) ?? 1}
              dayCount={layout.dayCount}
              todayOffset={todayOffset}
              formatters={formatters}
              strings={strings}
              focusedReservationId={activeId}
              selectedReservationId={selectedReservationId}
              onSelect={onReservationSelect}
            />
          );
        })}
      </div>
    </div>
  );
}
