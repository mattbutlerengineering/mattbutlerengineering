import { useMemo, useState, useEffect } from "react";
import type { Reservation, Table } from "@mbe/types";
import { ReservationBlock } from "./ReservationBlock";

export interface TimelineGridProps {
  tables: Table[];
  reservations: Reservation[];
  date: string;
  startHour?: number;
  endHour?: number;
  onReservationClick?: (reservation: Reservation) => void;
  selectedReservationId?: string | null;
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
    <div className="relative overflow-auto border rounded-lg bg-white">
      <div style={{ width: totalWidth, height: totalHeight }}>
        {/* Header row with hours */}
        <div
          className="sticky top-0 z-20 flex bg-gray-50 border-b"
          style={{ height: HEADER_HEIGHT }}
        >
          {/* Table column header */}
          <div
            className="sticky left-0 z-30 flex items-center px-3 bg-gray-50 border-r font-medium text-gray-700"
            style={{ width: TABLE_COLUMN_WIDTH, minWidth: TABLE_COLUMN_WIDTH }}
          >
            Tables
          </div>
          {/* Hour headers */}
          {hours.map((hour) => (
            <div
              key={hour}
              className="flex items-center justify-center border-r text-sm text-gray-500"
              style={{ width: HOUR_WIDTH, minWidth: HOUR_WIDTH }}
            >
              {formatHour(hour)}
            </div>
          ))}
        </div>

        {/* Table rows */}
        {tables.map((table) => (
          <div
            key={table.id}
            className="flex"
            style={{ height: ROW_HEIGHT }}
          >
            {/* Table name column */}
            <div
              className="sticky left-0 z-10 flex items-center px-3 bg-white border-r border-b"
              style={{ width: TABLE_COLUMN_WIDTH, minWidth: TABLE_COLUMN_WIDTH }}
            >
              <div>
                <div className="font-medium text-gray-900">
                  {table.tableNumber || table.name}
                </div>
                <div className="text-xs text-gray-500">
                  {table.minCovers}-{table.maxCovers ?? table.capacity} guests
                </div>
              </div>
            </div>

            {/* Time slots with reservations */}
            <div className="relative flex-1 border-b">
              {/* Hour grid lines */}
              <div className="absolute inset-0 flex">
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="border-r border-gray-100"
                    style={{ width: HOUR_WIDTH }}
                  />
                ))}
              </div>

              {/* Reservation blocks */}
              {getTableReservations(table.id).map((reservation) => {
                const style = getReservationStyle(reservation);
                return (
                  <ReservationBlock
                    key={reservation.id}
                    reservation={reservation}
                    style={style}
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
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none"
            style={{ left: TABLE_COLUMN_WIDTH + currentTimeOffset }}
          >
            <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-red-500 rounded-full" />
          </div>
        )}
      </div>
    </div>
  );
}
