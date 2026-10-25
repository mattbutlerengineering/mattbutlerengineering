import { partyFitsTable, type DurationRule, type VenueSettings } from "@mbe/types";

/**
 * Table fit, conflict and pacing — the per-slot rules, moved here from the
 * reservations service's `slot-rules.ts` so every booking path judges a slot
 * the same way (ADR-030). Pure: the current instant is always an argument.
 */

const DEFAULT_DURATION_RULES: DurationRule[] = [
  { minPartySize: 1, maxPartySize: 2, durationMinutes: 75 },
  { minPartySize: 3, maxPartySize: 4, durationMinutes: 90 },
  { minPartySize: 5, maxPartySize: 6, durationMinutes: 105 },
  { minPartySize: 7, maxPartySize: 10, durationMinutes: 120 },
];

export const DEFAULT_SLOT_INTERVAL = 15; // minutes

const MS_PER_MINUTE = 60_000;

/** The venue settings the engine reads. */
export type EngineSettings = Pick<
  VenueSettings,
  | "durationRules"
  | "defaultReservationDuration"
  | "pacingRules"
  | "slotIntervalMinutes"
  | "maxPartySize"
>;

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

type DateThreshold = { lt: Date } | { gt: Date };

function passesThreshold(value: Date, threshold: DateThreshold): boolean {
  return "lt" in threshold ? value < threshold.lt : value > threshold.gt;
}

export function estimateDuration(partySize: number, settings?: EngineSettings | null): number {
  const rules = settings?.durationRules ?? DEFAULT_DURATION_RULES;
  const rule = rules.find((r) => partySize >= r.minPartySize && partySize <= r.maxPartySize);

  if (rule) return rule.durationMinutes;

  if (settings?.defaultReservationDuration) {
    return settings.defaultReservationDuration;
  }

  const largestRule = rules.reduce((max, r) => (r.maxPartySize > max.maxPartySize ? r : max));
  const extraGuests = partySize - largestRule.maxPartySize;
  const extraTime = Math.ceil(extraGuests / 2) * 15;
  return largestRule.durationMinutes + extraTime;
}

export function filterSuitableTables<T extends TableFilter>(tables: T[], partySize: number): T[] {
  return tables.filter((t) => t.isActive && partyFitsTable(t, partySize));
}

/** The double-booking overlap rule, declared once as a half-open window `[startTime, endTime)`. */
export function overlapWindow(
  startTime: Date,
  endTime: Date
): { startTime: DateThreshold; endTime: DateThreshold } {
  return {
    startTime: { lt: endTime },
    endTime: { gt: startTime },
  };
}

/** A hold guards its slot only while still active (`expiresAt` in the future). */
export function activeHoldWindow(now: Date): DateThreshold {
  return { gt: now };
}

export function checkTableConflict(
  tableId: string,
  startTime: Date,
  endTime: Date,
  reservations: readonly ReservationSlim[],
  holds: readonly HoldSlim[],
  now: Date
): boolean {
  const window = overlapWindow(startTime, endTime);

  const hasReservationConflict = reservations.some(
    (r) =>
      r.tableId === tableId &&
      passesThreshold(r.startTime, window.startTime) &&
      passesThreshold(r.endTime, window.endTime)
  );

  if (hasReservationConflict) return true;

  const activeWindow = activeHoldWindow(now);
  return holds.some(
    (h) =>
      h.tableId === tableId &&
      passesThreshold(h.expiresAt, activeWindow) &&
      passesThreshold(h.startTime, window.startTime) &&
      passesThreshold(h.endTime, window.endTime)
  );
}

/**
 * Covers starting in the pacing window, plus this party, against the cap: the
 * venue's first pacing rule, lowered by `coverCap` (Tonight) when given.
 */
export function checkPacingForSlot(
  startTime: Date,
  partySize: number,
  settings: EngineSettings | null | undefined,
  reservations: readonly ReservationSlim[],
  holds: readonly HoldSlim[],
  now: Date,
  coverCap?: number
): boolean {
  const rule = settings?.pacingRules?.[0];
  const cap = Math.min(rule?.maxCoversPerSlot ?? Infinity, coverCap ?? Infinity);
  if (cap === Infinity) return true;

  const windowMinutes =
    rule?.timeWindowMinutes ?? settings?.slotIntervalMinutes ?? DEFAULT_SLOT_INTERVAL;
  const windowEnd = new Date(startTime.getTime() + windowMinutes * MS_PER_MINUTE);
  const inWindow = (s: { startTime: Date }) => s.startTime >= startTime && s.startTime < windowEnd;

  const reservationCovers = reservations.filter(inWindow).reduce((sum, r) => sum + r.partySize, 0);
  const holdCovers = holds
    .filter((h) => h.expiresAt > now && inWindow(h))
    .reduce((sum, h) => sum + h.partySize, 0);

  return reservationCovers + holdCovers + partySize <= cap;
}

export function selectBestTable<T extends TableCandidate>(
  candidates: readonly T[],
  startTime: Date,
  endTime: Date,
  reservations: readonly ReservationSlim[],
  holds: readonly HoldSlim[],
  now: Date
): T | null {
  return (
    candidates.find(
      (table) => !checkTableConflict(table.id, startTime, endTime, reservations, holds, now)
    ) ?? null
  );
}
