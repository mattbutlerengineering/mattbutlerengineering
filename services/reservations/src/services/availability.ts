import {
  toDateString,
  type TimeSlot,
  type AvailableTable,
  type DateAvailability,
  type VenueSettings,
  type OperatingHours,
} from "@mbe/types";
import type { Table } from "../generated/prisma/index.js";
import { prisma } from "./database.js";
import {
  DEFAULT_SLOT_INTERVAL,
  checkTableConflict,
  checkPacingForSlot,
  selectBestTable,
  estimateDuration,
  filterSuitableTables,
  parseOperatingHours,
  type ReservationSlim,
  type HoldSlim,
  type TableFilter,
  type TableCandidate,
} from "./slot-rules.js";

// Re-export pure types and functions for callers that import them from this module.
export type { ReservationSlim, HoldSlim, TableFilter, TableCandidate };
export {
  checkTableConflict,
  checkPacingForSlot,
  selectBestTable,
  estimateDuration,
  filterSuitableTables,
  parseOperatingHours,
};

const DEFAULT_LAST_SEATING_BUFFER = 90; // minutes before close

interface VenueWithSettings {
  id: string;
  name: string;
  slug: string;
  ianaTimezone: string;
  settings: VenueSettings | null;
  operatingHours: OperatingHours | null;
}

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Generates available time slots for a venue on a specific date.
 */
export async function generateTimeSlots(
  venueId: string,
  date: string,
  partySize: number,
  durationOverride?: number
): Promise<TimeSlot[]> {
  const prismaVenue = await prisma.venue.findUnique({
    where: { id: venueId },
  });

  if (!prismaVenue) {
    return [];
  }

  const venue: VenueWithSettings = {
    id: prismaVenue.id,
    name: prismaVenue.name,
    slug: prismaVenue.slug,
    ianaTimezone: prismaVenue.ianaTimezone,
    settings: prismaVenue.settings as VenueSettings | null,
    operatingHours: prismaVenue.operatingHours as OperatingHours | null,
  };

  const settings = venue.settings;
  const schedule = parseOperatingHours(venue.operatingHours, date);

  if (!schedule) {
    return [];
  }

  const slotInterval = settings?.slotIntervalMinutes ?? DEFAULT_SLOT_INTERVAL;
  const lastSeatingBuffer = settings?.lastSeatingBuffer ?? DEFAULT_LAST_SEATING_BUFFER;
  const duration = durationOverride ?? estimateDuration(partySize, settings);

  const openMinutes = parseTimeToMinutes(schedule.open);
  const closeMinutes = parseTimeToMinutes(schedule.close);
  const lastSeatingMinutes = closeMinutes - lastSeatingBuffer;

  const suitableTables = await findSuitableTables(venueId, partySize);

  if (suitableTables.length === 0) {
    return [];
  }

  const { reservations, holds } = await fetchConflictData(venueId, date);

  const slots: TimeSlot[] = [];

  for (let minutes = openMinutes; minutes <= lastSeatingMinutes; minutes += slotInterval) {
    const slotStart = createDateTimeFromMinutes(date, minutes, venue.ianaTimezone);
    const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

    // Uses the same pure predicates (checkTableConflict + checkPacingForSlot)
    // that assertBookable composes on write paths — same rules, no divergence.
    const availableTables: AvailableTable[] = [];

    for (const table of suitableTables) {
      const hasConflict = checkTableConflict(table.id, slotStart, slotEnd, reservations, holds);

      if (!hasConflict) {
        availableTables.push({
          id: table.id,
          name: table.name,
          capacity: table.capacity,
          minCovers: table.minCovers,
          maxCovers: table.maxCovers,
        });
      }
    }

    const pacingOk = checkPacingForSlot(slotStart, partySize, settings, reservations, holds);

    slots.push({
      time: slotStart.toISOString(),
      available: availableTables.length > 0 && pacingOk,
      tables: availableTables.length > 0 ? availableTables : undefined,
    });
  }

  return slots;
}

/**
 * Gets dates with availability in a date range.
 */
export async function getAvailableDates(
  venueId: string,
  startDate: string,
  endDate: string,
  partySize: number
): Promise<DateAvailability[]> {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const maxDays = 60;
  const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const actualEnd = new Date(start.getTime() + Math.min(daysDiff, maxDays) * 24 * 60 * 60 * 1000);

  const [prismaVenue, suitableTables] = await Promise.all([
    prisma.venue.findUnique({ where: { id: venueId } }),
    findSuitableTables(venueId, partySize),
  ]);

  if (!prismaVenue || suitableTables.length === 0) {
    const results: DateAvailability[] = [];
    for (let d = new Date(start); d <= actualEnd; d.setDate(d.getDate() + 1)) {
      results.push({ date: toDateString(d), hasAvailability: false, slotCount: 0 });
    }
    return results;
  }

  const venue: VenueWithSettings = {
    id: prismaVenue.id,
    name: prismaVenue.name,
    slug: prismaVenue.slug,
    ianaTimezone: prismaVenue.ianaTimezone,
    settings: prismaVenue.settings as VenueSettings | null,
    operatingHours: prismaVenue.operatingHours as OperatingHours | null,
  };

  const [allReservations, allHolds] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        venueId,
        date: { gte: start, lte: actualEnd },
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
      },
      select: { id: true, tableId: true, startTime: true, endTime: true, partySize: true },
    }),
    prisma.reservationHold.findMany({
      where: {
        venueId,
        date: { gte: start, lte: actualEnd },
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        tableId: true,
        startTime: true,
        endTime: true,
        partySize: true,
        expiresAt: true,
      },
    }),
  ]);

  const settings = venue.settings;
  const slotInterval = settings?.slotIntervalMinutes ?? DEFAULT_SLOT_INTERVAL;
  const lastSeatingBuffer = settings?.lastSeatingBuffer ?? DEFAULT_LAST_SEATING_BUFFER;
  const duration = estimateDuration(partySize, settings);

  const reservationsByDate = new Map<string, typeof allReservations>();
  for (const r of allReservations) {
    const key = toDateString(r.startTime);
    const bucket = reservationsByDate.get(key);
    if (bucket) {
      bucket.push(r);
    } else {
      reservationsByDate.set(key, [r]);
    }
  }

  const holdsByDate = new Map<string, typeof allHolds>();
  for (const h of allHolds) {
    const key = toDateString(h.startTime);
    const bucket = holdsByDate.get(key);
    if (bucket) {
      bucket.push(h);
    } else {
      holdsByDate.set(key, [h]);
    }
  }

  const results: DateAvailability[] = [];

  for (let d = new Date(start); d <= actualEnd; d.setDate(d.getDate() + 1)) {
    const dateStr = toDateString(d);
    const schedule = parseOperatingHours(venue.operatingHours, dateStr);

    if (!schedule) {
      results.push({ date: dateStr, hasAvailability: false, slotCount: 0 });
      continue;
    }

    const dateReservations = reservationsByDate.get(dateStr) ?? [];
    const dateHolds = holdsByDate.get(dateStr) ?? [];

    const openMinutes = parseTimeToMinutes(schedule.open);
    const closeMinutes = parseTimeToMinutes(schedule.close);
    const lastSeatingMinutes = closeMinutes - lastSeatingBuffer;

    let availableCount = 0;

    for (let minutes = openMinutes; minutes <= lastSeatingMinutes; minutes += slotInterval) {
      const slotStart = createDateTimeFromMinutes(dateStr, minutes, venue.ianaTimezone);
      const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

      const hasAvailableTable = suitableTables.some(
        (table) => !checkTableConflict(table.id, slotStart, slotEnd, dateReservations, dateHolds)
      );

      if (hasAvailableTable) {
        availableCount++;
      }
    }

    results.push({
      date: dateStr,
      hasAvailability: availableCount > 0,
      slotCount: availableCount,
    });
  }

  return results;
}

/**
 * Finds the best available table for a reservation.
 */
export async function findBestTable(
  venueId: string,
  date: string,
  startTime: Date,
  endTime: Date,
  partySize: number
): Promise<Table | null> {
  const tables = await findSuitableTables(venueId, partySize);

  const { reservations, holds } = await fetchConflictData(venueId, date);

  return selectBestTable(tables, startTime, endTime, reservations, holds) as Table | null;
}

// --- Helper functions ---

async function findSuitableTables(venueId: string, partySize: number): Promise<Table[]> {
  return prisma.table.findMany({
    where: {
      venueId,
      isActive: true,
      minCovers: { lte: partySize },
      OR: [{ maxCovers: { gte: partySize } }, { maxCovers: null }],
    },
    orderBy: [{ priority: "desc" }, { capacity: "asc" }],
  });
}

/**
 * Fetches the reservation and hold slices needed to evaluate conflict and
 * pacing rules for a venue on a given date.
 */
export async function fetchConflictData(
  venueId: string,
  date: string
): Promise<{ reservations: ReservationSlim[]; holds: HoldSlim[] }> {
  const [reservations, holds] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        venueId,
        date: new Date(date),
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
      },
      select: {
        id: true,
        tableId: true,
        startTime: true,
        endTime: true,
        partySize: true,
      },
    }),
    prisma.reservationHold.findMany({
      where: {
        venueId,
        date: new Date(date),
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        tableId: true,
        startTime: true,
        endTime: true,
        partySize: true,
        expiresAt: true,
      },
    }),
  ]);

  return { reservations, holds };
}

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
  const tzHour = parseInt(get("hour"), 10);
  const tzMin = parseInt(get("minute"), 10);
  const tzTotalMin = tzHour * 60 + tzMin;
  const utcTotalMin = utcGuess.getUTCHours() * 60 + utcGuess.getUTCMinutes();

  let offsetMin = tzTotalMin - utcTotalMin;
  if (offsetMin > 720) offsetMin -= 1440;
  if (offsetMin < -720) offsetMin += 1440;

  return new Date(new Date(localIso + "Z").getTime() - offsetMin * 60 * 1000);
}

// availabilityService only contains IO methods — pure rules live in slot-rules.ts.
export const availabilityService = {
  generateTimeSlots,
  getAvailableDates,
  findBestTable,
  fetchConflictData,
};
