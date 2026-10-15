/** The table fields that decide whether a party fits. */
export interface PartyFitTable {
  capacity: number;
  minCovers: number;
  maxCovers: number | null;
}

/**
 * The largest party a table takes: `maxCovers`, or the table's `capacity` when
 * `maxCovers` is unset. Onboarding creates every table with `maxCovers: null`,
 * so a null ceiling must mean "capacity", never "unlimited" (#6495).
 */
export function tableMaxCovers(table: Pick<PartyFitTable, "capacity" | "maxCovers">): number {
  return table.maxCovers ?? table.capacity;
}

/**
 * The one definition of "does a party of `partySize` fit this table", shared by
 * server availability/booking and client seating. Status, activity, and venue
 * scoping are separate concerns and stay with the callers.
 */
export function partyFitsTable(table: PartyFitTable, partySize: number): boolean {
  return table.minCovers <= partySize && partySize <= tableMaxCovers(table);
}
