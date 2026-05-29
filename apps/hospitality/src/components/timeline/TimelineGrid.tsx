import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { toDateString, type Reservation, type Table, type TableStatus } from "@mbe/types";
import { ReservationBlock } from "./ReservationBlock";
import { TableStatusBadge } from "../TableStatusBadge.js";
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

  const [focusedReservationId, setFocusedReservationId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const allReservations = useMemo(() => {
    const arr: { reservation: Reservation; tableIndex: number }[] = [];
    tables.forEach((table, tableIndex) => {
      reservations
        .filter((r) => r.tableId === table.id)
        .forEach((reservation) => {
          arr.push({ reservation, tableIndex });
        });
    });
    return arr;
  }, [tables, reservations]);

  const flatReservations = useMemo(() => {
    return allReservations.map((r) => r.reservation);
  }, [allReservations]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (flatReservations.length === 0) return;

      const currentIndex = focusedReservationId
        ? flatReservations.findIndex((r) => r.id === focusedReservationId)
        : -1;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          if (focusedReservationId) {
            const nextIdx = Math.min(currentIndex + 1, flatReservations.length - 1);
            setFocusedReservationId(flatReservations[nextIdx].id);
          } else if (flatReservations.length > 0) {
            setFocusedReservationId(flatReservations[0].id);
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (focusedReservationId) {
            const prevIdx = Math.max(currentIndex - 1, 0);
            setFocusedReservationId(flatReservations[prevIdx].id);
          } else if (flatReservations.length > 0) {
            setFocusedReservationId(flatReservations[flatReservations.length - 1].id);
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          if (focusedReservationId) {
            const currentTableInfo = allReservations[currentIndex];
            const nextTableReservations = allReservations.filter(
              (r) => r.tableIndex === currentTableInfo.tableIndex + 1
            );
            if (nextTableReservations.length > 0) {
              setFocusedReservationId(nextTableReservations[0].reservation.id);
            }
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (focusedReservationId) {
            const currentTableInfo = allReservations[currentIndex];
            if (currentTableInfo.tableIndex > 0) {
              const prevTableReservations = allReservations.filter(
                (r) => r.tableIndex === currentTableInfo.tableIndex - 1
              );
              if (prevTableReservations.length > 0) {
                setFocusedReservationId(
                  prevTableReservations[prevTableReservations.length - 1].reservation.id
                );
              }
            }
          }
          break;
        case "Enter":
        case " ":
          if (focusedReservationId) {
            const res = flatReservations.find((r) => r.id === focusedReservationId);
            if (res) onReservationClick?.(res);
          }
          break;
        case "Escape":
          setFocusedReservationId(null);
          break;
      }
    },
    [flatReservations, allReservations, onReservationClick, focusedReservationId]
  );

  useEffect(() => {
    if (focusedReservationId && selectedReservationId !== focusedReservationId) {
      const res = flatReservations.find((r) => r.id === focusedReservationId);
      if (res) onReservationClick?.(res);
    }
  }, [focusedReservationId, selectedReservationId, onReservationClick, flatReservations]);

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

  const getTableReservations = useCallback(
    (tableId: string) => {
      return reservations.filter((r) => r.tableId === tableId);
    },
    [reservations]
  );

  const getReservationStyle = useCallback(
    (reservation: Reservation) => {
      const startTime = new Date(reservation.startTime);
      const endTime = new Date(reservation.endTime);

      const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
      const endMinutes = endTime.getHours() * 60 + endTime.getMinutes();
      const startOffset = startMinutes - startHour * 60;
      const duration = endMinutes - startMinutes;

      const left = (startOffset / 60) * hourWidth;
      const width = Math.max((duration / 60) * hourWidth - 4, isMobile ? 30 : 40);

      return { left, width };
    },
    [startHour, hourWidth, isMobile]
  );

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
      ref={containerRef}
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
                const blockStyle = getReservationStyle(reservation);
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

      {showMobileView && flatReservations.length > 0 && (
        <div className={styles.mobileNavHint} aria-live="polite">
          Use arrow keys to navigate reservations
        </div>
      )}
    </div>
  );
}
