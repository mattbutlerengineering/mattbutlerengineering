/** Format a Date to YYYY-MM-DD string (e.g., "2026-04-05") */
export function toDateString(date: Date): string {
  return date.toISOString().substring(0, 10);
}
