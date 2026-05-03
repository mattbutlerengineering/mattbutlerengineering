/**
 * Shared mock factories for reservations service tests.
 *
 * Every factory returns an Object.freeze'd instance so tests cannot
 * accidentally mutate shared state. Use the `overrides` parameter to
 * customise individual fields — the factory will merge and freeze a
 * fresh copy each time.
 */

import type { TableShapeMetadata, TableStatus } from "@mbe/types";

// ---------------------------------------------------------------------------
// Types — keep in sync with Prisma-generated models
// ---------------------------------------------------------------------------

export interface MockTable {
  readonly id: string;
  readonly name: string;
  readonly tableNumber: string | null;
  readonly capacity: number;
  readonly minCovers: number;
  readonly maxCovers: number | null;
  readonly location: string | null;
  readonly isActive: boolean;
  readonly priority: number;
  readonly status: TableStatus;
  readonly venueId: string | null;
  readonly floorPlanId: string | null;
  readonly shapeMetadata: TableShapeMetadata | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MockReservation {
  readonly id: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly partySize: number;
  readonly status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  readonly notes: string | null;
  readonly cancellationReason: string | null;
  readonly cancellationNote: string | null;
  readonly guestName: string;
  readonly guestEmail: string | null;
  readonly guestPhone: string | null;
  readonly guestId: string | null;
  readonly userId: string | null;
  readonly tableId: string;
  readonly table: MockTable;
  readonly venueId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MockJWTPayload {
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

export interface MockPagination {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrev: boolean;
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

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
  });
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
    permissions: ["admin"],
    ...overrides,
  });
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

// ---------------------------------------------------------------------------
// Error message constants
// ---------------------------------------------------------------------------

export const ERROR_NOT_FOUND = "Not Found";
export const ERROR_UNAUTHORIZED = "Unauthorized";
export const ERROR_CONFLICT = "Conflict";
export const ERROR_FORBIDDEN = "Forbidden";
