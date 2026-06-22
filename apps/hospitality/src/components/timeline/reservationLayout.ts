export interface ReservationLayoutParams {
  startHour: number;
  hourWidth: number;
  isMobile: boolean;
}

export interface ReservationLayoutResult {
  left: number;
  width: number;
}

/**
 * Pure function: compute the absolute pixel position of a reservation block
 * on the timeline grid.
 *
 * @param startTime - ISO date string (local-time parsing via getHours/getMinutes)
 * @param endTime   - ISO date string
 * @param params    - grid layout parameters
 */
export function computeReservationLayout(
  startTime: string,
  endTime: string,
  { startHour, hourWidth, isMobile }: ReservationLayoutParams
): ReservationLayoutResult {
  const start = new Date(startTime);
  const end = new Date(endTime);

  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  const startOffset = startMinutes - startHour * 60;
  const duration = endMinutes - startMinutes;

  const left = (startOffset / 60) * hourWidth;
  const width = Math.max((duration / 60) * hourWidth - 4, isMobile ? 30 : 40);

  return { left, width };
}
