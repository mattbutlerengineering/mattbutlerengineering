import {
  toDateString,
  type TimeSlot,
  type AvailableTable,
  type DateAvailability,
  type ConflictCheckResult,
  type PacingCheckResult,
  type VenueSettings,
  type OperatingHours,
  type DaySchedule,
  type DurationRule,
} from "@mbe/types";
import type { Table } from "../generated/prisma/index.js";
import { prisma } from "./database.js";

// Default duration rules based on party size
const DEFAULT_DURATION_RULES: DurationRule[] = [
  { minPartySize: 1, maxPartySize: 2, durationMinutes: 75 },
  { minPartySize: 3, maxPartySize: 4, durationMinutes: 90 },
  { minPartySize: 5, maxPartySize: 6, durationMinutes: 105 },
  { minPartySize: 7, maxPartySize: 10, durationMinutes: 120 },
];

// Default settings
const DEFAULT_SLOT_INTERVAL = 15; // minutes
const DEFAULT_LAST_SEATING_BUFFER = 90; // minutes before close

interface VenueWithSettings {
  id: string;
  name: string;
  slug: string;
  ianaTimezone: string;
  settings: VenueSettings | null;
  operatingHours: OperatingHours | null;
}

/**
 * Estimates the duration of a reservation based on party size and venue rules.
 */
export function estimateDuration(
  partySize: number,
  venueSettings?: VenueSettings | null
): number {
  // Use venue-specific rules if available
  const rules = venueSettings?.durationRules ?? DEFAULT_DURATION_RULES;

  // Find the matching rule
  const rule = rules.find(
    (r) => partySize >= r.minPartySize && partySize <= r.maxPartySize
  );

  if (rule) {
    return rule.durationMinutes;
  }

  // Fallback: use default duration or extrapolate for large parties
  if (venueSettings?.defaultReservationDuration) {
    return venueSettings.defaultReservationDuration;
  }

  // For parties larger than rules cover, use the largest rule + 15min per additional 2 guests
  const largestRule = rules.reduce((max, r) =>
    r.maxPartySize > max.maxPartySize ? r : max
  );
  const extraGuests = partySize - largestRule.maxPartySize;
  const extraTime = Math.ceil(extraGuests / 2) * 15;
  return largestRule.durationMinutes + extraTime;
}

/**
 * Gets the operating hours for a specific day of the week.
 */
function getDaySchedule(
  operatingHours: OperatingHours | null,
  date: Date
): DaySchedule | null {
  if (!operatingHours) return null;

  const dayNames = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ] as const;
  const dayName = dayNames[date.getDay()];
  const schedule = operatingHours[dayName];

  if (!schedule || schedule.closed) return null;
  return schedule;
}

/**
 * Parses a time string (e.g., "18:00") to minutes since midnight.
 */
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
  // Fetch venue with settings
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
  const dateObj = new Date(date);
  const schedule = getDaySchedule(venue.operatingHours, dateObj);

  if (!schedule) {
    return []; // Venue closed on this day
  }

  // Get slot configuration
  const slotInterval = settings?.slotIntervalMinutes ?? DEFAULT_SLOT_INTERVAL;
  const lastSeatingBuffer =
    settings?.lastSeatingBuffer ?? DEFAULT_LAST_SEATING_BUFFER;
  const duration = durationOverride ?? estimateDuration(partySize, settings);

  // Parse operating hours
  const openMinutes = parseTimeToMinutes(schedule.open);
  const closeMinutes = parseTimeToMinutes(schedule.close);
  const lastSeatingMinutes = closeMinutes - lastSeatingBuffer;

  // Get tables that can accommodate the party
  const suitableTables = await findSuitableTables(venueId, partySize);

  if (suitableTables.length === 0) {
    return [];
  }

  // Get existing reservations and holds for the date
  const [reservations, holds] = await Promise.all([
    getReservationsForDate(venueId, date),
    getHoldsForDate(venueId, date),
  ]);

  // Generate slots
  const slots: TimeSlot[] = [];

  for (
    let minutes = openMinutes;
    minutes <= lastSeatingMinutes;
    minutes += slotInterval
  ) {
    const slotStart = createDateTimeFromMinutes(date, minutes, venue.ianaTimezone);
    const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

    // Check which tables are available for this slot
    const availableTables: AvailableTable[] = [];

    for (const table of suitableTables) {
      const hasConflict = checkTableConflict(
        table.id,
        slotStart,
        slotEnd,
        reservations,
        holds
      );

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

    // Check pacing limits
    const pacingOk = await checkPacingForSlot(
      venueId,
      slotStart,
      partySize,
      settings,
      reservations,
      holds
    );

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

  // Limit range to 60 days
  const maxDays = 60;
  const daysDiff = Math.ceil(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  );
  const actualEnd = new Date(
    start.getTime() + Math.min(daysDiff, maxDays) * 24 * 60 * 60 * 1000
  );

  // Hoist venue + tables queries outside the loop (same for every date)
  const [prismaVenue, suitableTables] = await Promise.all([
    prisma.venue.findUnique({ where: { id: venueId } }),
    findSuitableTables(venueId, partySize),
  ]);

  if (!prismaVenue || suitableTables.length === 0) {
    // No venue or no tables — every date is unavailable
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

  // Bulk-fetch reservations and holds for the entire date range (2 queries total)
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
      select: { id: true, tableId: true, startTime: true, endTime: true, partySize: true, expiresAt: true },
    }),
  ]);

  const settings = venue.settings;
  const slotInterval = settings?.slotIntervalMinutes ?? DEFAULT_SLOT_INTERVAL;
  const lastSeatingBuffer = settings?.lastSeatingBuffer ?? DEFAULT_LAST_SEATING_BUFFER;
  const duration = estimateDuration(partySize, settings);

  const results: DateAvailability[] = [];

  for (let d = new Date(start); d <= actualEnd; d.setDate(d.getDate() + 1)) {
    const dateStr = toDateString(d);
    const schedule = getDaySchedule(venue.operatingHours, d);

    if (!schedule) {
      results.push({ date: dateStr, hasAvailability: false, slotCount: 0 });
      continue;
    }

    // Filter reservations and holds for this specific date
    const dateReservations = allReservations.filter(
      (r) => toDateString(r.startTime) === dateStr
    );
    const dateHolds = allHolds.filter(
      (h) => toDateString(h.startTime) === dateStr
    );

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
 * Uses best-fit algorithm: highest priority first, then smallest capacity that fits.
 */
export async function findBestTable(
  venueId: string,
  date: string,
  startTime: Date,
  endTime: Date,
  partySize: number
): Promise<Table | null> {
  // Get suitable tables sorted by priority (desc) then capacity (asc)
  const tables = await prisma.table.findMany({
    where: {
      venueId,
      isActive: true,
      minCovers: { lte: partySize },
      OR: [{ maxCovers: { gte: partySize } }, { maxCovers: null }],
    },
    orderBy: [{ priority: "desc" }, { capacity: "asc" }],
  });

  // Get existing reservations and holds
  const [reservations, holds] = await Promise.all([
    getReservationsForDate(venueId, date),
    getHoldsForDate(venueId, date),
  ]);

  // Find first table without conflicts
  for (const table of tables) {
    const hasConflict = checkTableConflict(
      table.id,
      startTime,
      endTime,
      reservations,
      holds
    );

    if (!hasConflict) {
      return table;
    }
  }

  return null;
}

/**
 * Checks if there's a conflict for a specific table and time range.
 */
export async function checkConflict(
  tableId: string,
  date: string,
  startTime: Date,
  endTime: Date,
  excludeReservationId?: string,
  excludeHoldId?: string
): Promise<ConflictCheckResult> {
  // Check for conflicting reservations
  const conflictingReservation = await prisma.reservation.findFirst({
    where: {
      tableId,
      date: new Date(date),
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
      id: excludeReservationId ? { not: excludeReservationId } : undefined,
      AND: [
        { startTime: { lt: endTime } },
        { endTime: { gt: startTime } },
      ],
    },
    select: { id: true },
  });

  if (conflictingReservation) {
    return {
      hasConflict: true,
      conflictingReservationId: conflictingReservation.id,
    };
  }

  // Check for conflicting holds (not expired)
  const conflictingHold = await prisma.reservationHold.findFirst({
    where: {
      tableId,
      date: new Date(date),
      expiresAt: { gt: new Date() },
      id: excludeHoldId ? { not: excludeHoldId } : undefined,
      AND: [
        { startTime: { lt: endTime } },
        { endTime: { gt: startTime } },
      ],
    },
    select: { id: true },
  });

  if (conflictingHold) {
    return {
      hasConflict: true,
      conflictingHoldId: conflictingHold.id,
    };
  }

  return { hasConflict: false };
}

/**
 * Checks if adding a reservation would exceed pacing limits.
 */
export async function checkPacing(
  venueId: string,
  startTime: Date,
  partySize: number,
  settings?: VenueSettings | null
): Promise<PacingCheckResult> {
  const pacingRules = settings?.pacingRules;

  if (!pacingRules || pacingRules.length === 0) {
    // No pacing rules configured
    return { withinLimit: true, currentCovers: 0, maxCovers: Infinity };
  }

  // Use the first pacing rule (could extend to support multiple rules)
  const rule = pacingRules[0];
  const windowMinutes = rule.timeWindowMinutes ?? settings?.slotIntervalMinutes ?? DEFAULT_SLOT_INTERVAL;

  // Define the time window
  const windowStart = startTime;
  const windowEnd = new Date(startTime.getTime() + windowMinutes * 60 * 1000);
  const dateStr = toDateString(startTime);

  // Count covers in reservations starting in this window
  const reservationCovers = await prisma.reservation.aggregate({
    where: {
      venueId,
      date: new Date(dateStr),
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
      startTime: { gte: windowStart, lt: windowEnd },
    },
    _sum: { partySize: true },
  });

  // Count covers in active holds starting in this window
  const holdCovers = await prisma.reservationHold.aggregate({
    where: {
      venueId,
      date: new Date(dateStr),
      expiresAt: { gt: new Date() },
      startTime: { gte: windowStart, lt: windowEnd },
    },
    _sum: { partySize: true },
  });

  const currentCovers =
    (reservationCovers._sum.partySize ?? 0) + (holdCovers._sum.partySize ?? 0);
  const totalAfterBooking = currentCovers + partySize;

  return {
    withinLimit: totalAfterBooking <= rule.maxCoversPerSlot,
    currentCovers,
    maxCovers: rule.maxCoversPerSlot,
  };
}

// --- Helper functions ---

async function findSuitableTables(
  venueId: string,
  partySize: number
): Promise<Table[]> {
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

interface ReservationSlim {
  id: string;
  tableId: string;
  startTime: Date;
  endTime: Date;
  partySize: number;
}

interface HoldSlim {
  id: string;
  tableId: string;
  startTime: Date;
  endTime: Date;
  partySize: number;
  expiresAt: Date;
}

async function getReservationsForDate(
  venueId: string,
  date: string
): Promise<ReservationSlim[]> {
  return prisma.reservation.findMany({
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
  });
}

async function getHoldsForDate(
  venueId: string,
  date: string
): Promise<HoldSlim[]> {
  return prisma.reservationHold.findMany({
    where: {
      venueId,
      date: new Date(date),
      expiresAt: { gt: new Date() }, // Only active holds
    },
    select: {
      id: true,
      tableId: true,
      startTime: true,
      endTime: true,
      partySize: true,
      expiresAt: true,
    },
  });
}

function checkTableConflict(
  tableId: string,
  startTime: Date,
  endTime: Date,
  reservations: ReservationSlim[],
  holds: HoldSlim[]
): boolean {
  // Check reservations
  const hasReservationConflict = reservations.some(
    (r) =>
      r.tableId === tableId &&
      r.startTime < endTime &&
      r.endTime > startTime
  );

  if (hasReservationConflict) return true;

  // Check active holds
  const hasHoldConflict = holds.some(
    (h) =>
      h.tableId === tableId &&
      h.expiresAt > new Date() &&
      h.startTime < endTime &&
      h.endTime > startTime
  );

  return hasHoldConflict;
}

function checkPacingForSlot(
  _venueId: string,
  startTime: Date,
  partySize: number,
  settings: VenueSettings | null | undefined,
  reservations: ReservationSlim[],
  holds: HoldSlim[]
): boolean {
  const pacingRules = settings?.pacingRules;

  if (!pacingRules || pacingRules.length === 0) {
    return true;
  }

  const rule = pacingRules[0];
  const windowMinutes = rule.timeWindowMinutes ?? settings?.slotIntervalMinutes ?? DEFAULT_SLOT_INTERVAL;
  const windowEnd = new Date(startTime.getTime() + windowMinutes * 60 * 1000);

  // Count covers starting in this window
  const reservationCovers = reservations
    .filter((r) => r.startTime >= startTime && r.startTime < windowEnd)
    .reduce((sum, r) => sum + r.partySize, 0);

  const holdCovers = holds
    .filter(
      (h) =>
        h.expiresAt > new Date() &&
        h.startTime >= startTime &&
        h.startTime < windowEnd
    )
    .reduce((sum, h) => sum + h.partySize, 0);

  const totalCovers = reservationCovers + holdCovers + partySize;
  return totalCovers <= rule.maxCoversPerSlot;
}

/**
 * Creates a Date object from a date string and minutes since midnight.
 */
/**
 * Create a Date representing a local time in the venue's timezone.
 * Uses Intl.DateTimeFormat to compute the UTC offset, avoiding external libraries.
 */
function createDateTimeFromMinutes(
  dateStr: string,
  minutes: number,
  timezone: string
): Date {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const localIso = `${dateStr}T${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:00`;

  // Build a Date assuming UTC, then compute the offset for the target timezone
  const utcGuess = new Date(localIso + "Z");

  // Format the same instant in the target timezone to find the local time there
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

  // Offset = how far ahead the timezone is from UTC (in minutes)
  let offsetMin = tzTotalMin - utcTotalMin;
  // Handle day boundary wrap
  if (offsetMin > 720) offsetMin -= 1440;
  if (offsetMin < -720) offsetMin += 1440;

  // Subtract the offset to convert local time → UTC
  return new Date(new Date(localIso + "Z").getTime() - offsetMin * 60 * 1000);
}

export const availabilityService = {
  generateTimeSlots,
  getAvailableDates,
  findBestTable,
  checkConflict,
  checkPacing,
  estimateDuration,
};
