import type {
  TimeSlot,
  AvailableTable,
  DateAvailability,
  AvailabilityClosure,
  BookingPaused,
} from "@mbe/types";
import {
  addDays,
  listSlots,
  serviceDayInstant,
  type BookingSnapshot,
  type Slot,
} from "@mbe/availability";
import type { Table } from "../generated/prisma/index.js";
import { prisma } from "./database.js";
import {
  selectBestTable,
  filterSuitableTables,
  bookingWindow,
  isSlotInBookingWindow,
  activeHoldWindow,
  NOT_BOOKED_STATUSES,
  type ReservationSlim,
  type HoldSlim,
} from "./slot-rules.js";
import {
  loadAvailabilitySnapshot,
  VenueNotFoundError,
  type LoadedSnapshot,
  type SnapshotLogger,
} from "./availability-snapshot.js";
import { dayNotices } from "./availability-notices.js";

// Re-export pure types and functions for callers that import them from this module.
export type { ReservationSlim, HoldSlim };
export { selectBestTable, filterSuitableTables };

/** `getAvailableDates` never computes more than this many days past the start. */
const MAX_RANGE_DAYS = 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Listing reads go through the snapshot loader and the availability engine
 * (ADR-030): one snapshot per call, whatever the range, then `listSlots` per
 * date. The booking window (advance limits) is applied here, around the engine.
 * Callers must be inside the venue's context (`venueScoped`/`publicVenueScoped`).
 */
export interface ListingOptions {
  /** Receives one warning per configuration row (or legacy column) that could not be read. */
  logger?: SnapshotLogger;
}

/** One date for the guest: its slots plus what to tell them when there are none. */
export interface DayAvailability {
  slots: TimeSlot[];
  closure?: AvailabilityClosure;
  bookingPaused?: BookingPaused;
}

async function loadOrNull(
  venueId: string,
  fromDate: string,
  toDate: string,
  now: Date,
  options: ListingOptions
): Promise<LoadedSnapshot | null> {
  try {
    return await loadAvailabilitySnapshot(venueId, fromDate, toDate, now, {
      logger: options.logger,
    });
  } catch (error) {
    if (error instanceof VenueNotFoundError) return null;
    throw error;
  }
}

/** A staff-supplied duration replaces the venue's duration rules for this party. */
function withDuration(
  snapshot: BookingSnapshot,
  partySize: number,
  durationMinutes: number | undefined
): BookingSnapshot {
  if (durationMinutes === undefined) return snapshot;
  const rule = { minPartySize: partySize, maxPartySize: partySize, durationMinutes };
  return { ...snapshot, settings: { ...snapshot.settings, durationRules: [rule] } };
}

function toTimeSlot(slot: Slot): TimeSlot {
  const tables: AvailableTable[] = slot.tables.map((t) => ({
    id: t.id,
    name: t.name,
    capacity: t.capacity,
    minCovers: t.minCovers,
    maxCovers: t.maxCovers,
  }));
  return {
    time: slot.start.toISOString(),
    available: slot.available,
    tables: tables.length > 0 ? tables : undefined,
  };
}

/**
 * The snapshot narrowed to bookings that can touch one service day: those starting
 * from the venue-local start of the day before to the end of the day after. A range
 * snapshot holds every booking of up to 61 days, and `listSlots` scans all of them
 * for every seating; the results are the same either way.
 */
function dayView(snapshot: BookingSnapshot, date: string): BookingSnapshot {
  const from = serviceDayInstant(addDays(date, -1), 0, snapshot.timezone);
  const to = serviceDayInstant(addDays(date, 2), 0, snapshot.timezone);
  // A zone whose clocks skip midnight has no such instant; keep everything.
  if (!from || !to) return snapshot;
  const nearby = (b: { startTime: Date }) => b.startTime >= from && b.startTime < to;
  return {
    ...snapshot,
    reservations: snapshot.reservations.filter(nearby),
    holds: snapshot.holds.filter(nearby),
  };
}

/** Every online seating of the date, and those a guest may book now (inside the booking window). */
function listDay(loaded: LoadedSnapshot, date: string, partySize: number, now: Date) {
  const { venueSettings } = loaded;
  const snapshot = dayView(loaded.snapshot, date);
  const seatings = listSlots(snapshot, date, partySize, "online", now);
  // No table could ever seat the party: offer no times at all, as before the engine.
  if (filterSuitableTables(snapshot.tables, partySize).length === 0) {
    return { seatings, offered: [] };
  }
  const window = bookingWindow(venueSettings, now, snapshot.timezone);
  return { seatings, offered: seatings.filter((s) => isSlotInBookingWindow(s.start, window)) };
}

function noticesFor(loaded: LoadedSnapshot, date: string, seatingCount: number) {
  return dayNotices(loaded.snapshot, date, loaded.venueSettings?.phone ?? null, seatingCount);
}

/** Slots for one date, with the closure or booking-pause notice the guest sees instead. */
export async function getDayAvailability(
  venueId: string,
  date: string,
  partySize: number,
  durationOverride?: number,
  options: ListingOptions = {}
): Promise<DayAvailability> {
  const now = new Date();
  const loaded = await loadOrNull(venueId, date, date, now, options);
  if (!loaded) return { slots: [] };
  const timed = { ...loaded, snapshot: withDuration(loaded.snapshot, partySize, durationOverride) };
  const { seatings, offered } = listDay(timed, date, partySize, now);
  return { slots: offered.map(toTimeSlot), ...noticesFor(loaded, date, seatings.length) };
}

/**
 * Generates available time slots for a venue on a specific date.
 */
export async function generateTimeSlots(
  venueId: string,
  date: string,
  partySize: number,
  durationOverride?: number,
  options: ListingOptions = {}
): Promise<TimeSlot[]> {
  return (await getDayAvailability(venueId, date, partySize, durationOverride, options)).slots;
}

/** The dates from `startDate` to `endDate` inclusive, capped at {@link MAX_RANGE_DAYS} past the start. */
function rangeDates(startDate: string, endDate: string): string[] {
  const span = Math.ceil((Date.parse(endDate) - Date.parse(startDate)) / MS_PER_DAY);
  const days = Math.min(span, MAX_RANGE_DAYS);
  return days >= 0 ? Array.from({ length: days + 1 }, (_, i) => addDays(startDate, i)) : [];
}

/**
 * Gets dates with availability in a date range, from one snapshot of the range.
 */
export async function getAvailableDates(
  venueId: string,
  startDate: string,
  endDate: string,
  partySize: number,
  options: ListingOptions = {}
): Promise<DateAvailability[]> {
  const dates = rangeDates(startDate, endDate);
  const lastDate = dates.at(-1);
  const now = new Date();
  const loaded = lastDate ? await loadOrNull(venueId, startDate, lastDate, now, options) : null;
  if (!loaded) return dates.map((date) => ({ date, hasAvailability: false, slotCount: 0 }));

  return dates.map((date) => {
    const { seatings, offered } = listDay(loaded, date, partySize, now);
    const slotCount = offered.filter((s) => s.available).length;
    const { closure } = noticesFor(loaded, date, seatings.length);
    return { date, hasAvailability: slotCount > 0, slotCount, ...(closure ? { closure } : {}) };
  });
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
  // The party-fits rule (maxCovers ?? capacity as the ceiling) lives in one
  // place - @mbe/types' partyFitsTable - so it is applied here rather than
  // re-expressed as a Prisma `where`, where null maxCovers meant "unlimited".
  const tables = await prisma.table.findMany({
    where: { venueId, isActive: true },
    orderBy: [{ priority: "desc" }, { capacity: "asc" }],
  });
  return filterSuitableTables(tables, partySize);
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
        status: { notIn: [...NOT_BOOKED_STATUSES] },
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
        expiresAt: activeHoldWindow(new Date()),
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

// availabilityService only contains IO methods — pure rules live in slot-rules.ts.
export const availabilityService = {
  generateTimeSlots,
  getDayAvailability,
  getAvailableDates,
  findBestTable,
  fetchConflictData,
};
