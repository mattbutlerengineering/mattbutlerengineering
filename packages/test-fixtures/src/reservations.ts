/**
 * Reservations domain fixture factories.
 *
 * Follows the create* convention. All factories return frozen objects to
 * prevent accidental mutation across tests.
 */

import type { Reservation, Table } from "@mbe/types";

/** The real `Table` contract — fixtures can no longer drift from it. */
export type MockTable = Table;

/** The real `Reservation` contract, with `table` always populated by the factory. */
export type MockReservation = Reservation & { readonly table: Table };

export interface MockPagination {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrev: boolean;
}

export function createMockTable(overrides?: Partial<MockTable>): MockTable {
  return Object.freeze({
    id: "table-123",
    name: "Table 1",
    tableNumber: "1",
    capacity: 4,
    minCovers: 1,
    maxCovers: null,
    location: "Main Floor",
    isActive: true,
    priority: 0,
    status: "AVAILABLE" as const,
    venueId: null,
    floorPlanId: null,
    shapeMetadata: null,
    createdAt: "2026-01-25T00:00:00.000Z",
    updatedAt: "2026-01-25T00:00:00.000Z",
    ...overrides,
  } satisfies Table);
}

export function createMockReservation(
  overrides?: Partial<Omit<MockReservation, "table">> & { table?: Partial<MockTable> }
): MockReservation {
  const { table: tableOverrides, ...restOverrides } = overrides ?? {};
  const table = createMockTable(tableOverrides);
  return Object.freeze({
    id: "res-123",
    date: "2026-02-15",
    startTime: "2026-02-15T18:00:00.000Z",
    endTime: "2026-02-15T20:00:00.000Z",
    partySize: 4,
    status: "PENDING" as const,
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    occasion: null,
    seatingPreference: null,
    guestName: "John Doe",
    guestEmail: "john@example.com",
    guestPhone: null,
    guestId: null,
    userId: null,
    tableId: table.id,
    table,
    venueId: null,
    createdAt: "2026-01-25T00:00:00.000Z",
    updatedAt: "2026-01-25T00:00:00.000Z",
    ...restOverrides,
  } satisfies MockReservation);
}

export function createMockPagination(overrides?: Partial<MockPagination>): MockPagination {
  return Object.freeze({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
    ...overrides,
  });
}

// Error message constants
export const ERROR_NOT_FOUND = "Not Found";
export const ERROR_UNAUTHORIZED = "Unauthorized";
export const ERROR_CONFLICT = "Conflict";
export const ERROR_FORBIDDEN = "Forbidden";
