import { addDays, minutesOfDayIn, venueDate } from "../../utils/service-day.js";

const MINUTES_PER_DAY = 1440;

export interface ReservationLayoutParams {
  startHour: number;
  hourWidth: number;
  isMobile: boolean;
  /** The service day the grid shows (ADR-029: a reservation's `date`). */
  serviceDate: string;
  /** The venue's IANA zone; positions are venue wall-clock. Omitted: the device clock. */
  timeZone?: string;
}

export interface ReservationLayoutResult {
  left: number;
  width: number;
}

/**
 * Minutes from the service day's midnight to `instant`, read on the venue's clock.
 * Past midnight keeps counting (00:30 the next morning is 1470), so a seating after
 * midnight, or one spanning it, stays on its own service day's axis.
 */
export function serviceDayMinute(instant: Date, serviceDate: string, timeZone?: string): number {
  const minute = minutesOfDayIn(instant, timeZone);
  const day = venueDate(instant, timeZone);
  if (day === addDays(serviceDate, 1)) return MINUTES_PER_DAY + minute;
  if (day === addDays(serviceDate, -1)) return minute - MINUTES_PER_DAY;
  return minute;
}

/**
 * Pure function: compute the absolute pixel position of a reservation block
 * on the timeline grid.
 *
 * @param startTime - ISO instant, read as venue wall-clock time (`params.timeZone`)
 * @param endTime   - ISO instant
 * @param params    - grid layout parameters
 */
export function computeReservationLayout(
  startTime: string,
  endTime: string,
  { startHour, hourWidth, isMobile, serviceDate, timeZone }: ReservationLayoutParams
): ReservationLayoutResult {
  const startMinutes = serviceDayMinute(new Date(startTime), serviceDate, timeZone);
  const endMinutes = serviceDayMinute(new Date(endTime), serviceDate, timeZone);
  const startOffset = startMinutes - startHour * 60;
  const duration = endMinutes - startMinutes;

  const left = (startOffset / 60) * hourWidth;
  const width = Math.max((duration / 60) * hourWidth - 4, isMobile ? 30 : 40);

  return { left, width };
}
