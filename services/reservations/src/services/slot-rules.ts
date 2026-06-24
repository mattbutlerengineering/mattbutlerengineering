import type { VenueSettings, OperatingHours, DaySchedule, DurationRule } from "@mbe/types";

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

export function checkTableConflict(
  tableId: string,
  startTime: Date,
  endTime: Date,
  reservations: ReservationSlim[],
  holds: HoldSlim[]
): boolean {
  const hasReservationConflict = reservations.some(
    (r) => r.tableId === tableId && r.startTime < endTime && r.endTime > startTime
  );

  if (hasReservationConflict) return true;

  return holds.some(
    (h) =>
      h.tableId === tableId &&
      h.expiresAt > new Date() &&
      h.startTime < endTime &&
      h.endTime > startTime
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
