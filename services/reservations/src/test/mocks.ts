/**
 * Shared reservations-service test fixtures.
 *
 * All factories return frozen objects to prevent accidental mutation across tests.
 * The JWT payload defaults to NO permissions; pass `{ permissions: ["admin"] }` to opt into admin.
 */

import type { Reservation, Table } from "@mbe/types";

type MockTable = Table;

type MockReservation = Reservation & { readonly table: Table };

interface MockPagination {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrev: boolean;
}

interface MockJWTPayload {
  readonly sub: string;
  readonly iss: string;
  readonly aud: string;
  readonly exp: number;
  readonly iat: number;
  readonly email: string;
  readonly email_verified: boolean;
  readonly name: string;
  readonly picture: string;
  readonly permissions: readonly string[];
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

export function createMockJWTPayload(overrides?: Partial<MockJWTPayload>): MockJWTPayload {
  return Object.freeze({
    sub: "auth0|user-123",
    iss: "https://test.auth0.com/",
    aud: "https://api.example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    email: "test@example.com",
    email_verified: true,
    name: "Test User",
    picture: "https://example.com/pic.jpg",
    // Least privilege: tests that need admin must ask for it explicitly.
    permissions: [],
    ...overrides,
  });
}

// Error message constants
export const ERROR_UNAUTHORIZED = "Unauthorized";
export const ERROR_CONFLICT = "Conflict";
export const ERROR_FORBIDDEN = "Forbidden";
