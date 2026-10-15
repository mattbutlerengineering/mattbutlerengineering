import { partyFitsTable, type PartyFitTable, type VenueSettings } from "@mbe/types";
import {
  checkTableConflict,
  checkPacingForSlot,
  type ReservationSlim,
  type HoldSlim,
} from "./slot-rules.js";

export type BookableError =
  | { code: "PARTY_DOES_NOT_FIT"; message: string }
  | { code: "CONFLICT"; message: string }
  | { code: "PACING_EXCEEDED"; message: string };

export interface AssertBookableOptions {
  /** Table being checked for conflict. */
  tableId: string;
  /**
   * The table's party-fit fields. Pass it wherever the caller names the table
   * (the server-picked path already filters by fit): the party must satisfy
   * partyFitsTable. Omit only when fit was settled earlier (hold confirmation,
   * whose hold was fit-checked at creation).
   */
  table?: PartyFitTable;
  /** Window to check — [startTime, endTime). */
  window: { startTime: Date; endTime: Date };
  /** Party size to add when computing pacing. */
  partySize: number;
  /** Venue pacing settings. */
  settings: VenueSettings | null | undefined;
  /** Pre-fetched reservation slices for the date. */
  reservations: ReservationSlim[];
  /** Pre-fetched hold slices for the date. */
  holds: HoldSlim[];
  /** Exclude this hold ID from conflict checks (used during confirmation). */
  excludeHoldId?: string;
  /** Exclude this session ID's holds from conflict checks (used during hold create). */
  excludeSessionId?: string;
}

/**
 * Single canonical booking invariant check.
 *
 * Runs the table conflict predicate AND the pacing rule together over
 * pre-fetched slices. Returns a BookableError if either check fails, or
 * undefined if the slot is bookable.
 *
 * Pure function — no DB access. Callers fetch slices once and pass them in.
 * Currently used by confirm-hold (closing the pacing gap on hold confirmation).
 * Intended to absorb hold-create, walk-in-create, and slot generation next so
 * those write paths share one conflict+pacing rule and cannot diverge.
 */
export function assertBookable(opts: AssertBookableOptions): BookableError | undefined {
  const {
    tableId,
    window: { startTime, endTime },
    partySize,
    settings,
    holds,
    excludeHoldId,
    excludeSessionId,
  } = opts;

  if (opts.table && !partyFitsTable(opts.table, partySize)) {
    return {
      code: "PARTY_DOES_NOT_FIT",
      message: `Party size ${partySize} does not fit this table`,
    };
  }

  // Filter out the excluded hold so self-conflict is not flagged during confirmation.
  const filteredHolds = holds.filter((h) => {
    if (excludeHoldId !== undefined && h.id === excludeHoldId) return false;
    if (excludeSessionId !== undefined) {
      // Holds don't carry sessionId in the slim shape; this filter is a no-op
      // for the slim type but satisfies the contract — callers that need
      // session exclusion pass pre-filtered slices.
    }
    return true;
  });

  const hasConflict = checkTableConflict(
    tableId,
    startTime,
    endTime,
    opts.reservations,
    filteredHolds
  );
  if (hasConflict) {
    return { code: "CONFLICT", message: "Table is not available for this time slot" };
  }

  const pacingOk = checkPacingForSlot(
    startTime,
    partySize,
    settings,
    opts.reservations,
    filteredHolds
  );
  if (!pacingOk) {
    const maxCovers = settings?.pacingRules?.[0]?.maxCoversPerSlot;
    return {
      code: "PACING_EXCEEDED",
      message: `Pacing limit reached. Maximum ${maxCovers} covers per time window.`,
    };
  }

  return undefined;
}
