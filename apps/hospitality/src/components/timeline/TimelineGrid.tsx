import { useMemo, useState, useEffect } from "react";
import type { Reservation, Table, TableStatus } from "@mbe/types";
import { ReservationBlock } from "./ReservationBlock";
import { TableStatusBadge } from "../TableStatusBadge.js";
import styles from "./TimelineGrid.module.css";

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

const HOUR_WIDTH = 120; // pixels per hour
const ROW_HEIGHT = 60; // pixels per table row
const HEADER_HEIGHT = 40;
const TABLE_COLUMN_WIDTH = 120;

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
  // Generate hour labels
  const hours = useMemo(() => {
    const result = [];
    for (let h = startHour; h <= endHour; h++) {
      result.push(h);
    }
    return result;
  }, [startHour, endHour]);

  // Format hour for display
  const formatHour = (hour: number) => {
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour} ${ampm}`;
  };

  // Get reservations for a specific table
  const getTableReservations = (tableId: string) => {
    return reservations.filter((r) => r.tableId === tableId);
  };

  // Calculate position and width for a reservation block
  const getReservationStyle = (reservation: Reservation) => {
    const startTime = new Date(reservation.startTime);
    const endTime = new Date(reservation.endTime);

    const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
    const endMinutes = endTime.getHours() * 60 + endTime.getMinutes();
    const startOffset = startMinutes - startHour * 60;
    const duration = endMinutes - startMinutes;

    const left = (startOffset / 60) * HOUR_WIDTH;
    const width = (duration / 60) * HOUR_WIDTH;

    return { left, width };
  };

  // Current time indicator - updates every minute
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const isToday = date === currentTime.toISOString().split("T")[0];
  const currentTimeOffset = useMemo(() => {
    if (!isToday) return null;
    const minutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    const offset = minutes - startHour * 60;
    if (offset < 0 || offset > (endHour - startHour) * 60) return null;
    return (offset / 60) * HOUR_WIDTH;
  }, [isToday, startHour, endHour, currentTime]);

  const totalWidth = TABLE_COLUMN_WIDTH + hours.length * HOUR_WIDTH;
  const totalHeight = HEADER_HEIGHT + tables.length * ROW_HEIGHT;

  return (
    <div className={styles.gridWrapper} role="grid" aria-label="Reservation timeline">
      <div style={{ width: totalWidth, height: totalHeight }}>
        {/* Header row with hours */}
        <div className={styles.headerRow} role="row" style={{ height: HEADER_HEIGHT }}>
          {/* Table column header */}
          <div
            className={styles.tableColumnHeader}
            role="columnheader"
            style={{ width: TABLE_COLUMN_WIDTH, minWidth: TABLE_COLUMN_WIDTH }}
          >
            Tables
          </div>
          {/* Hour headers */}
          {hours.map((hour) => (
            <div
              key={hour}
              className={styles.hourHeader}
              role="columnheader"
              style={{ width: HOUR_WIDTH, minWidth: HOUR_WIDTH }}
            >
              {formatHour(hour)}
            </div>
          ))}
        </div>

        {/* Table rows */}
        {tables.map((table) => (
          <div key={table.id} className={styles.tableRow} role="row" aria-label={`Table ${table.name}`} style={{ height: ROW_HEIGHT }}>
            {/* Table name column */}
            <div
              className={styles.tableNameCell}
              role="rowheader"
              style={{ width: TABLE_COLUMN_WIDTH, minWidth: TABLE_COLUMN_WIDTH }}
            >
              <div>
                <div className={styles.tableName}>{table.tableNumber || table.name}</div>
                <div className={styles.tableCapacity}>
                  {table.minCovers}-{table.maxCovers ?? table.capacity} guests
                </div>
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

            {/* Time slots with reservations */}
            <div className={styles.reservationArea} role="gridcell">
              {/* Hour grid lines */}
              <div className={styles.hourGrid}>
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className={styles.hourGridLine}
                    style={{ width: HOUR_WIDTH }}
                  />
                ))}
              </div>

              {/* Reservation blocks */}
              {getTableReservations(table.id).map((reservation) => {
                const blockStyle = getReservationStyle(reservation);
                return (
                  <ReservationBlock
                    key={reservation.id}
                    reservation={reservation}
                    style={blockStyle}
                    isSelected={reservation.id === selectedReservationId}
                    onClick={() => onReservationClick?.(reservation)}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {/* Current time indicator */}
        {currentTimeOffset !== null && (
          <div
            className={styles.currentTimeIndicator}
            style={{ left: TABLE_COLUMN_WIDTH + currentTimeOffset }}
          >
            <div className={styles.currentTimeDot} />
          </div>
        )}
      </div>
    </div>
  );
}
