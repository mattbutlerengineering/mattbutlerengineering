import { useMemo, useState, useEffect, useRef, type RefObject } from "react";
import type { Reservation, Table, TableStatus } from "@mbe/types";
import { ReservationBlock } from "./ReservationBlock";
import { TableStatusMenu } from "./TableStatusMenu.js";
import { TimelineEmptyNight, type TimelineEmptyNightProps } from "./TimelineEmptyNight.js";
import { useScrollToNow } from "./useScrollToNow.js";
import { useTimelineKeyboard } from "../../hooks/useTimelineKeyboard.js";
import { useGridFocus } from "./useGridFocus.js";
import { computeReservationLayout, type ReservationLayoutResult } from "./reservationLayout.js";
import { formatTime } from "../../utils/format.js";
import { localDateString } from "../../utils/local-clock.js";
import styles from "./TimelineGrid.module.css";

const HOUR_WIDTH = 120;
const ROW_HEIGHT = 60;
const HEADER_HEIGHT = 40;
const TABLE_COLUMN_WIDTH = 120;
const MOBILE_BREAKPOINT = 768;
const MOBILE_HOUR_WIDTH = 60;
const MOBILE_TABLE_COLUMN_WIDTH = 80;

export interface TimelineGridProps {
  tables: Table[];
  reservations: Reservation[];
  date: string;
  startHour?: number;
  endHour?: number;
  onReservationClick?: (reservation: Reservation) => void;
  selectedReservationId?: string | null;
  onTableStatusChange?: (tableId: string, status: TableStatus) => void;
  /** Parties on their (OCCUPIED) table right now — the block's success LED (ux.md Screen 2). */
  seatedIds?: ReadonlySet<string>;
  /** Height, in px, of a sheet covering the grid's bottom edge (ux.md Screen 4). */
  bottomInset?: number;
  /** The quiet night over the hour columns (ux.md Screen 7); null or absent renders nothing. */
  emptyNight?: TimelineEmptyNightProps | null;
  /** The table whose status change is in flight — its trigger is disabled and gold. */
  pendingTableId?: string | null;
}

/**
 * Hosts the scroll-to-now effect in a leaf: `useMotionPreset` subscribes to rialto's device
 * store, whose first subscription re-syncs the caller once, and the grid's own render count is
 * what #4967's style-identity test measures.
 */
function NowLineScroller({
  scrollRef,
  currentTimeOffset,
  tableColumnWidth,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  currentTimeOffset: number | null;
  tableColumnWidth: number;
}) {
  useScrollToNow(scrollRef, currentTimeOffset, tableColumnWidth);
  return null;
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches
      : false
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isMobile;
}

export function TimelineGrid({
  tables,
  reservations,
  date,
  startHour = 11,
  endHour = 23,
  onReservationClick,
  selectedReservationId,
  onTableStatusChange,
  seatedIds,
  bottomInset,
  emptyNight,
  pendingTableId,
}: TimelineGridProps) {
  const isMobile = useIsMobile();
  const scrollRef = useRef<HTMLDivElement>(null);
  const hourWidth = isMobile ? MOBILE_HOUR_WIDTH : HOUR_WIDTH;
  const tableColumnWidth = isMobile ? MOBILE_TABLE_COLUMN_WIDTH : TABLE_COLUMN_WIDTH;

  const keyboardEntries = useMemo(() => {
    const arr: { reservationId: string; tableIndex: number }[] = [];
    tables.forEach((table, tableIndex) => {
      reservations
        .filter((r) => r.tableId === table.id)
        .forEach((reservation) => {
          arr.push({ reservationId: reservation.id, tableIndex });
        });
    });
    return arr;
  }, [tables, reservations]);

  const { focusedId: focusedReservationId, handleKeyDown } = useTimelineKeyboard({
    entries: keyboardEntries,
    onActivate: (id) => {
      const res = reservations.find((r) => r.id === id);
      if (res) onReservationClick?.(res);
    },
  });

  useEffect(() => {
    if (focusedReservationId && selectedReservationId !== focusedReservationId) {
      const res = reservations.find((r) => r.id === focusedReservationId);
      if (res) onReservationClick?.(res);
    }
  }, [focusedReservationId, selectedReservationId, onReservationClick, reservations]);

  const hours = useMemo(() => {
    const result = [];
    for (let h = startHour; h <= endHour; h++) {
      result.push(h);
    }
    return result;
  }, [startHour, endHour]);

  const gridFocus = useGridFocus({ rowCount: tables.length, colCount: hours.length });

  const handleGridKeyDown = (e: React.KeyboardEvent) => {
    handleKeyDown(e);
    gridFocus.handleKeyDown(e);
  };

  const formatHour = (hour: number) => {
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return isMobile ? `${displayHour}` : `${displayHour} ${ampm}`;
  };

  const reservationsByTable = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const reservation of reservations) {
      const existing = map.get(reservation.tableId);
      if (existing) {
        existing.push(reservation);
      } else {
        map.set(reservation.tableId, [reservation]);
      }
    }
    return map;
  }, [reservations]);

  const reservationStyleById = useMemo(() => {
    const map = new Map<string, ReservationLayoutResult>();
    for (const reservation of reservations) {
      map.set(
        reservation.id,
        computeReservationLayout(reservation.startTime, reservation.endTime, {
          startHour,
          hourWidth,
          isMobile,
        })
      );
    }
    return map;
  }, [reservations, startHour, hourWidth, isMobile]);

  const [currentTime, setCurrentTime] = useState(() => new Date());
  const lastMinuteRef = useRef(currentTime.getMinutes());

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      if (now.getMinutes() !== lastMinuteRef.current) {
        lastMinuteRef.current = now.getMinutes();
        setCurrentTime(now);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Browser-local day (ux.md decision (a)): the UTC-keyed toDateString emptied the grid at 17:00 Pacific.
  const isToday = date === localDateString(currentTime);
  const currentTimeOffset = useMemo(() => {
    if (!isToday) return null;
    const minutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    const offset = minutes - startHour * 60;
    // The endHour column is drawn (endHour:00–endHour:59), so the line runs through it too.
    if (offset < 0 || offset >= hours.length * 60) return null;
    return (offset / 60) * hourWidth;
  }, [isToday, startHour, hours.length, currentTime, hourWidth]);

  const totalWidth = tableColumnWidth + hours.length * hourWidth;
  const totalHeight = HEADER_HEIGHT + tables.length * ROW_HEIGHT;

  const showMobileView = isMobile && tables.length > 0;

  return (
    <div className={styles.gridFrame}>
      <NowLineScroller
        scrollRef={scrollRef}
        currentTimeOffset={currentTimeOffset}
        tableColumnWidth={tableColumnWidth}
      />
      <div
        ref={scrollRef}
        data-testid="timeline-grid"
        className={`${styles.gridWrapper} ${showMobileView ? styles.gridWrapperMobile : ""}`}
        role="grid"
        aria-label="Reservation timeline"
        tabIndex={0}
        onKeyDown={handleGridKeyDown}
        style={bottomInset ? { scrollPaddingBlockEnd: bottomInset } : undefined}
      >
        <div style={{ width: totalWidth, height: totalHeight }}>
          <div className={styles.headerRow} role="row" style={{ height: HEADER_HEIGHT }}>
            <div
              className={styles.tableColumnHeader}
              role="columnheader"
              style={{ width: tableColumnWidth, minWidth: tableColumnWidth }}
            >
              Tables
            </div>
            {hours.map((hour) => (
              <div
                key={hour}
                className={styles.hourHeader}
                role="columnheader"
                style={{ width: hourWidth, minWidth: hourWidth }}
              >
                {formatHour(hour)}
              </div>
            ))}
          </div>

          {tables.map((table, rowIndex) => (
            <div
              key={table.id}
              data-testid={`table-row-${table.id}`}
              className={styles.tableRow}
              role="row"
              aria-label={`Table ${table.name}`}
              style={{ height: ROW_HEIGHT }}
            >
              <div
                className={styles.tableNameCell}
                role="rowheader"
                style={{ width: tableColumnWidth, minWidth: tableColumnWidth }}
              >
                <div className={styles.tableMeta}>
                  <div className={styles.tableNameLine}>
                    <div className={styles.tableName}>{table.tableNumber || table.name}</div>
                    {isMobile ? null : (
                      <div className={styles.tableCapacity}>
                        {table.minCovers}-{table.maxCovers ?? table.capacity} guests
                      </div>
                    )}
                  </div>
                  <TableStatusMenu
                    tableId={table.id}
                    tableName={table.name}
                    status={table.status}
                    pending={pendingTableId === table.id}
                    onChange={(next) => onTableStatusChange?.(table.id, next)}
                  />
                </div>
              </div>

              <div className={styles.reservationArea} role="gridcell">
                <div className={styles.hourGrid}>
                  {hours.map((hour, colIndex) => {
                    const isActiveCell =
                      gridFocus.active.row === rowIndex && gridFocus.active.col === colIndex;
                    return (
                      <div
                        key={hour}
                        data-testid={`grid-cell-${rowIndex}-${colIndex}`}
                        className={`${styles.hourGridLine} ${
                          isActiveCell ? styles.hourGridLineActive : ""
                        }`}
                        style={{ width: hourWidth }}
                      />
                    );
                  })}
                </div>

                {(reservationsByTable.get(table.id) ?? []).map((reservation) => {
                  // Invariant: reservationStyleById is built from the same `reservations`
                  // array reservationsByTable groups from, so every reservation reachable
                  // here always has an entry.
                  const blockStyle = reservationStyleById.get(reservation.id)!;
                  const isFocused = focusedReservationId === reservation.id;
                  return (
                    <ReservationBlock
                      key={reservation.id}
                      reservation={reservation}
                      style={blockStyle}
                      isSelected={reservation.id === selectedReservationId}
                      isFocused={isFocused}
                      isSeated={seatedIds?.has(reservation.id) ?? false}
                      onClick={onReservationClick}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          {currentTimeOffset !== null && (
            <div
              data-testid="now-line"
              className={styles.currentTimeIndicator}
              style={{ left: tableColumnWidth + currentTimeOffset }}
            >
              <div className={styles.currentTimeDot} />
              <div className={styles.currentTimeLabel} aria-hidden="true">
                {formatTime(currentTime.toISOString())}
              </div>
            </div>
          )}
        </div>

        {showMobileView && keyboardEntries.length > 0 && (
          <div className={styles.mobileNavHint} aria-live="polite">
            Use arrow keys to navigate reservations
          </div>
        )}
      </div>

      {/* Outside role="grid" (its children must be rows) and outside the scroller, so it never
          scrolls away with the now-line; the two custom properties place it over the hour columns. */}
      {emptyNight && (
        <div
          style={
            {
              "--timeline-header-height": `${HEADER_HEIGHT}px`,
              "--timeline-table-column-width": `${tableColumnWidth}px`,
            } as React.CSSProperties
          }
        >
          <TimelineEmptyNight {...emptyNight} />
        </div>
      )}
    </div>
  );
}
