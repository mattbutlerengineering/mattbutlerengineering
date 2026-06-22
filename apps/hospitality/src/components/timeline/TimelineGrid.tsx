import { useMemo, useState, useEffect, useRef } from "react";
import { toDateString, type Reservation, type Table, type TableStatus } from "@mbe/types";
import { ReservationBlock } from "./ReservationBlock";
import { TableStatusBadge } from "../TableStatusBadge.js";
import { useTimelineKeyboard } from "../../hooks/useTimelineKeyboard.js";
import { computeReservationLayout } from "./reservationLayout.js";
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
}: TimelineGridProps) {
  const isMobile = useIsMobile();
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

  const formatHour = (hour: number) => {
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return isMobile ? `${displayHour}` : `${displayHour} ${ampm}`;
  };

  const getTableReservations = (tableId: string) =>
    reservations.filter((r) => r.tableId === tableId);

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

  const isToday = date === toDateString(currentTime);
  const currentTimeOffset = useMemo(() => {
    if (!isToday) return null;
    const minutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    const offset = minutes - startHour * 60;
    if (offset < 0 || offset > (endHour - startHour) * 60) return null;
    return (offset / 60) * hourWidth;
  }, [isToday, startHour, endHour, currentTime, hourWidth]);

  const totalWidth = tableColumnWidth + hours.length * hourWidth;
  const totalHeight = HEADER_HEIGHT + tables.length * ROW_HEIGHT;

  const showMobileView = isMobile && tables.length > 0;

  return (
    <div
      data-testid="timeline-grid"
      className={`${styles.gridWrapper} ${showMobileView ? styles.gridWrapperMobile : ""}`}
      role="grid"
      aria-label="Reservation timeline"
      tabIndex={0}
      onKeyDown={handleKeyDown}
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

        {tables.map((table) => (
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
              <div>
                <div className={styles.tableName}>{table.tableNumber || table.name}</div>
                {isMobile ? null : (
                  <div className={styles.tableCapacity}>
                    {table.minCovers}-{table.maxCovers ?? table.capacity} guests
                  </div>
                )}
                <TableStatusBadge
                  status={table.status}
                  size="sm"
                  onClick={
                    onTableStatusChange
                      ? () => {
                          const nextStatus: Record<TableStatus, TableStatus> = {
                            AVAILABLE: "OCCUPIED",
                            OCCUPIED: "DIRTY",
                            DIRTY: "AVAILABLE",
                            READY: "AVAILABLE",
                          };
                          onTableStatusChange(table.id, nextStatus[table.status]);
                        }
                      : undefined
                  }
                />
              </div>
            </div>

            <div className={styles.reservationArea} role="gridcell">
              <div className={styles.hourGrid}>
                {hours.map((hour) => (
                  <div key={hour} className={styles.hourGridLine} style={{ width: hourWidth }} />
                ))}
              </div>

              {getTableReservations(table.id).map((reservation) => {
                const blockStyle = computeReservationLayout(
                  reservation.startTime,
                  reservation.endTime,
                  { startHour, hourWidth, isMobile }
                );
                const isFocused = focusedReservationId === reservation.id;
                return (
                  <ReservationBlock
                    key={reservation.id}
                    reservation={reservation}
                    style={blockStyle}
                    isSelected={reservation.id === selectedReservationId}
                    isFocused={isFocused}
                    onClick={() => onReservationClick?.(reservation)}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {currentTimeOffset !== null && (
          <div
            className={styles.currentTimeIndicator}
            style={{ left: tableColumnWidth + currentTimeOffset }}
          >
            <div className={styles.currentTimeDot} />
          </div>
        )}
      </div>

      {showMobileView && keyboardEntries.length > 0 && (
        <div className={styles.mobileNavHint} aria-live="polite">
          Use arrow keys to navigate reservations
        </div>
      )}
    </div>
  );
}
