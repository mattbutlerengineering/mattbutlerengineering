import type { OperatingHours, TimeSlot, VenueSettings } from "@mbe/types";
import {
  DEFAULT_SLOT_INTERVAL,
  bookingWindow,
  checkPacingForSlot,
  checkTableConflict,
  estimateDuration,
  filterSuitableTables,
  isSlotInBookingWindow,
  parseOperatingHours,
  type TableFilter,
} from "../services/slot-rules.js";

/**
 * The pre-engine `generateTimeSlots` loop, frozen as a test oracle for the SC
 * Migration golden test (#7502, #7503). It is the "before" every engine path is
 * compared against: the listing itself now runs on `@mbe/availability`. Inputs
 * are the venue and tables; no reservations or holds, as in the golden test.
 * Never import this from production code.
 */

const DEFAULT_LAST_SEATING_BUFFER = 90;

export interface OracleVenue {
  ianaTimezone: string;
  settings: VenueSettings | null;
  operatingHours: OperatingHours | null;
}

export interface OracleTable extends TableFilter {
  name: string;
}

const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours! * 60 + minutes!;
};

function createDateTimeFromMinutes(dateStr: string, minutes: number, timezone: string): Date {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const localIso = `${dateStr}T${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:00`;
  const utcGuess = new Date(localIso + "Z");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(utcGuess);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const tzTotalMin = parseInt(get("hour"), 10) * 60 + parseInt(get("minute"), 10);
  const utcTotalMin = utcGuess.getUTCHours() * 60 + utcGuess.getUTCMinutes();
  let offsetMin = tzTotalMin - utcTotalMin;
  if (offsetMin > 720) offsetMin -= 1440;
  if (offsetMin < -720) offsetMin += 1440;
  return new Date(utcGuess.getTime() - offsetMin * 60 * 1000);
}

export function legacyTimeSlots(
  venue: OracleVenue,
  tables: OracleTable[],
  date: string,
  partySize: number,
  now: Date
): TimeSlot[] {
  const { settings } = venue;
  const schedule = parseOperatingHours(venue.operatingHours, date);
  if (!schedule) return [];
  const interval = settings?.slotIntervalMinutes ?? DEFAULT_SLOT_INTERVAL;
  const buffer = settings?.lastSeatingBuffer ?? DEFAULT_LAST_SEATING_BUFFER;
  const duration = estimateDuration(partySize, settings);
  const lastSeating = toMinutes(schedule.close) - buffer;
  const suitable = filterSuitableTables(tables, partySize);
  if (suitable.length === 0) return [];
  const window = bookingWindow(settings, now, venue.ianaTimezone);

  const slots: TimeSlot[] = [];
  for (let minutes = toMinutes(schedule.open); minutes <= lastSeating; minutes += interval) {
    const start = createDateTimeFromMinutes(date, minutes, venue.ianaTimezone);
    if (!isSlotInBookingWindow(start, window)) continue;
    const end = new Date(start.getTime() + duration * 60 * 1000);
    const free = suitable
      .filter((t) => !checkTableConflict(t.id, start, end, [], []))
      .map((t) => ({
        id: t.id,
        name: t.name,
        capacity: t.capacity,
        minCovers: t.minCovers,
        maxCovers: t.maxCovers,
      }));
    const pacingOk = checkPacingForSlot(start, partySize, settings, [], []);
    slots.push({
      time: start.toISOString(),
      available: free.length > 0 && pacingOk,
      tables: free.length > 0 ? free : undefined,
    });
  }
  return slots;
}
