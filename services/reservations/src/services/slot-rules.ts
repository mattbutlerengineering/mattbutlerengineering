import type {
  VenueSettings,
  OperatingHours,
  DaySchedule,
  DurationRule,
  ReservationStatus,
} from "@mbe/types";

const DEFAULT_DURATION_RULES: DurationRule[] = [
  { minPartySize: 1, maxPartySize: 2, durationMinutes: 75 },
  { minPartySize: 3, maxPartySize: 4, durationMinutes: 90 },
  { minPartySize: 5, maxPartySize: 6, durationMinutes: 105 },
  { minPartySize: 7, maxPartySize: 10, durationMinutes: 120 },
];

export const DEFAULT_SLOT_INTERVAL = 15; // minutes

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function scheduleForDay(operatingHours: OperatingHours, dayIndex: number): DaySchedule | null {
  const schedule = operatingHours[DAY_NAMES[dayIndex]];
  if (!schedule || schedule.closed) return null;
  return schedule;
}

// --- Interfaces ---

export interface TableFilter {
  id: string;
  capacity: number;
  minCovers: number;
  maxCovers: number | null;
  isActive: boolean;
}

export interface TableCandidate {
  id: string;
  capacity: number;
  priority: number;
}

export interface ReservationSlim {
  id: string;
  tableId: string;
  startTime: Date;
  endTime: Date;
  partySize: number;
}

export interface HoldSlim {
  id: string;
  tableId: string;
  startTime: Date;
  endTime: Date;
  partySize: number;
  expiresAt: Date;
}

// --- Pure rule functions ---

export function estimateDuration(partySize: number, venueSettings?: VenueSettings | null): number {
  const rules = venueSettings?.durationRules ?? DEFAULT_DURATION_RULES;
  const rule = rules.find((r) => partySize >= r.minPartySize && partySize <= r.maxPartySize);

  if (rule) return rule.durationMinutes;

  if (venueSettings?.defaultReservationDuration) {
    return venueSettings.defaultReservationDuration;
  }

  const largestRule = rules.reduce((max, r) => (r.maxPartySize > max.maxPartySize ? r : max));
  const extraGuests = partySize - largestRule.maxPartySize;
  const extraTime = Math.ceil(extraGuests / 2) * 15;
  return largestRule.durationMinutes + extraTime;
}

export function filterSuitableTables<T extends TableFilter>(tables: T[], partySize: number): T[] {
  return tables.filter(
    (t) =>
      t.isActive && t.minCovers <= partySize && (t.maxCovers === null || t.maxCovers >= partySize)
  );
}

export function parseOperatingHours(
  operatingHours: OperatingHours | null,
  date: string
): DaySchedule | null {
  if (!operatingHours) return null;
  // YYYY-MM-DD strings parse as UTC midnight; getUTCDay keeps weekday resolution
  // timezone-stable (same as internal getDaySchedule via getUTCDay).
  return scheduleForDay(operatingHours, new Date(date).getUTCDay());
}

// --- Double-booking predicate: single declaration ---
//
// The overlap window, the "booked" status set, and the hold-expiry rule are
// declared once here as Prisma-shaped threshold/filter data. checkTableConflict
// (below) evaluates them in memory; bookSlot's SQL re-check spreads the SAME
// values directly into its Prisma `where` clause. One declaration, two
// consumers — the two forms cannot silently diverge.

/**
 * Reservation statuses that no longer occupy their table slot — excluded from
 * every double-booking conflict check (both the fetch queries that build
 * {@link ReservationSlim} slices and bookSlot's SQL re-check).
 */
export const NOT_BOOKED_STATUSES: readonly ReservationStatus[] = ["CANCELLED", "NO_SHOW"];

type DateThreshold = { lt: Date } | { gt: Date };

function passesThreshold(value: Date, threshold: DateThreshold): boolean {
  return "lt" in threshold ? value < threshold.lt : value > threshold.gt;
}

/**
 * The double-booking overlap rule, declared once as a half-open window
 * `[startTime, endTime)`. checkTableConflict evaluates these thresholds
 * against in-memory Dates via {@link passesThreshold}; bookSlot spreads this
 * same object into a Prisma `where` clause.
 */
export function overlapWindow(
  startTime: Date,
  endTime: Date
): { startTime: DateThreshold; endTime: DateThreshold } {
  return {
    startTime: { lt: endTime },
    endTime: { gt: startTime },
  };
}

/**
 * The hold-expiry rule, declared once: a hold guards its slot only while
 * still active (`expiresAt` in the future). Shared by the pure re-check, the
 * fetch queries that build {@link HoldSlim} slices, and bookSlot's SQL form.
 */
export function activeHoldWindow(now: Date): DateThreshold {
  return { gt: now };
}

export function checkTableConflict(
  tableId: string,
  startTime: Date,
  endTime: Date,
  reservations: ReservationSlim[],
  holds: HoldSlim[]
): boolean {
  const window = overlapWindow(startTime, endTime);

  const hasReservationConflict = reservations.some(
    (r) =>
      r.tableId === tableId &&
      passesThreshold(r.startTime, window.startTime) &&
      passesThreshold(r.endTime, window.endTime)
  );

  if (hasReservationConflict) return true;

  const activeWindow = activeHoldWindow(new Date());
  return holds.some(
    (h) =>
      h.tableId === tableId &&
      passesThreshold(h.expiresAt, activeWindow) &&
      passesThreshold(h.startTime, window.startTime) &&
      passesThreshold(h.endTime, window.endTime)
  );
}

export function checkPacingForSlot(
  startTime: Date,
  partySize: number,
  settings: VenueSettings | null | undefined,
  reservations: ReservationSlim[],
  holds: HoldSlim[]
): boolean {
  const pacingRules = settings?.pacingRules;

  if (!pacingRules || pacingRules.length === 0) return true;

  const rule = pacingRules[0];
  const windowMinutes =
    rule.timeWindowMinutes ?? settings?.slotIntervalMinutes ?? DEFAULT_SLOT_INTERVAL;
  const windowEnd = new Date(startTime.getTime() + windowMinutes * 60 * 1000);

  const reservationCovers = reservations
    .filter((r) => r.startTime >= startTime && r.startTime < windowEnd)
    .reduce((sum, r) => sum + r.partySize, 0);

  const holdCovers = holds
    .filter((h) => h.expiresAt > new Date() && h.startTime >= startTime && h.startTime < windowEnd)
    .reduce((sum, h) => sum + h.partySize, 0);

  return reservationCovers + holdCovers + partySize <= rule.maxCoversPerSlot;
}

export function selectBestTable(
  candidates: TableCandidate[],
  startTime: Date,
  endTime: Date,
  reservations: ReservationSlim[],
  holds: HoldSlim[]
): TableCandidate | null {
  for (const table of candidates) {
    if (!checkTableConflict(table.id, startTime, endTime, reservations, holds)) {
      return table;
    }
  }
  return null;
}
