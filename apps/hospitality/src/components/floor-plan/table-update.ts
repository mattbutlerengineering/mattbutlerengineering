import type { Table, UpdateTableRequest } from "@mbe/types";

/**
 * Form state for the floor-plan editor's table-details form.
 *
 * Every field is a string (except the boolean toggle) because that is what an
 * `<input>` holds. Parsing lives in `buildTableUpdate`, so a half-typed number
 * is representable as itself rather than as `NaN`.
 */
export interface TableDetailsFormValues {
  name: string;
  tableNumber: string;
  capacity: string;
  minCovers: string;
  maxCovers: string;
  location: string;
  isActive: boolean;
}

/** Seeds form state from a table. Absent optional fields become empty strings. */
export function tableToFormValues(table: Table): TableDetailsFormValues {
  return {
    name: table.name,
    tableNumber: table.tableNumber ?? "",
    capacity: String(table.capacity),
    minCovers: String(table.minCovers),
    // A numeric input needs a value, and `PATCH /api/v1/tables/:id` has no way
    // to express "clear the maximum" — `maxCovers` is `number | undefined` on
    // the wire, never null. Seeding an absent maximum from capacity keeps the
    // field meaningful without inventing a write: the delta below is computed
    // against these seeded values, so leaving the field alone sends nothing.
    maxCovers: String(table.maxCovers ?? table.capacity),
    location: table.location ?? "",
    isActive: table.isActive,
  };
}

/**
 * The PATCH body for a table edit: only the fields the operator actually
 * changed, compared against the values the form was seeded with.
 *
 * Diffing against the seeded values rather than the `Table` is what keeps the
 * form from writing fields nobody touched — see the `maxCovers` note above.
 */
export function buildTableUpdate(
  initial: TableDetailsFormValues,
  current: TableDetailsFormValues
): UpdateTableRequest {
  const changes: UpdateTableRequest = {};

  const name = current.name.trim();
  if (name !== initial.name.trim()) changes.name = name;

  const tableNumber = current.tableNumber.trim();
  if (tableNumber !== initial.tableNumber.trim()) changes.tableNumber = tableNumber;

  const location = current.location.trim();
  if (location !== initial.location.trim()) changes.location = location;

  if (current.isActive !== initial.isActive) changes.isActive = current.isActive;

  const capacity = changedPositiveInt(initial.capacity, current.capacity);
  if (capacity !== null) changes.capacity = capacity;

  const minCovers = changedPositiveInt(initial.minCovers, current.minCovers);
  if (minCovers !== null) changes.minCovers = minCovers;

  const maxCovers = changedPositiveInt(initial.maxCovers, current.maxCovers);
  if (maxCovers !== null) changes.maxCovers = maxCovers;

  return changes;
}

/**
 * The new value of a numeric field, or null when it is unchanged or not a
 * positive whole number. The form validates too, but this is a boundary of its
 * own: an unparseable entry must never reach the API as `NaN`.
 */
function changedPositiveInt(initial: string, current: string): number | null {
  if (current.trim() === initial.trim()) return null;
  return parsePositiveInt(current);
}

/** Parses a positive whole number, or null for anything else. */
export function parsePositiveInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return parsed >= 1 ? parsed : null;
}
