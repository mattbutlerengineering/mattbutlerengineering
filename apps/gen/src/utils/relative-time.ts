/**
 * Formats a date as a human-readable relative time string using Intl.RelativeTimeFormat.
 * Examples: "2 seconds ago", "5 minutes ago", "3 hours ago"
 */
export function relativeTime(date: Date): string {
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const diffMs = date.getTime() - Date.now();
  const diffSecs = Math.round(diffMs / 1000);
  const diffMins = Math.round(diffSecs / 60);
  if (Math.abs(diffSecs) < 60) return rtf.format(diffSecs, "second");
  if (Math.abs(diffMins) < 60) return rtf.format(diffMins, "minute");
  const diffHours = Math.round(diffMins / 60);
  return rtf.format(diffHours, "hour");
}
