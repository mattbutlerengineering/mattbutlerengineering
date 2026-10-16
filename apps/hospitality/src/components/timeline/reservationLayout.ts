import { minutesOfDayIn } from "../../utils/service-day.js";

export interface ReservationLayoutParams {
  startHour: number;
  hourWidth: number;
  isMobile: boolean;
  /** The venue's IANA zone; positions are venue wall-clock. Omitted: the device clock. */
  timeZone?: string;
}

export interface ReservationLayoutResult {
  left: number;
  width: number;
}

/**
 * Pure function: compute the absolute pixel position of a reservation block
 * on the timeline grid.
 *
 * @param startTime - ISO instant, read as venue wall-clock time (`params.timeZone`)
 * @param endTime   - ISO date string
 * @param params    - grid layout parameters
 */
export function computeReservationLayout(
  startTime: string,
  endTime: string,
  { startHour, hourWidth, isMobile, timeZone }: ReservationLayoutParams
): ReservationLayoutResult {
  const start = new Date(startTime);
  const end = new Date(endTime);

  const startMinutes = minutesOfDayIn(start, timeZone);
  const endMinutes = minutesOfDayIn(end, timeZone);
  const startOffset = startMinutes - startHour * 60;
  const duration = endMinutes - startMinutes;

  const left = (startOffset / 60) * hourWidth;
  const width = Math.max((duration / 60) * hourWidth - 4, isMobile ? 30 : 40);

  return { left, width };
}
