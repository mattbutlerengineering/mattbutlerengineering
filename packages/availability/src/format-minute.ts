import { MINUTES_PER_DAY } from "./types.js";

/** "10:30 PM" for a minute past a service day's midnight (wraps past 1440). */
export function formatMinute(minute: number): string {
  const m = minute % MINUTES_PER_DAY;
  const hour24 = Math.floor(m / 60);
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(m % 60).padStart(2, "0")} ${hour24 < 12 ? "AM" : "PM"}`;
}
