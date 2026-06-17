/**
 * Tests for @mbe/test-fixtures
 *
 * Verifies that:
 * - All factory functions exist with the create* naming convention
 * - Factories return frozen objects (immutable)
 * - Overrides are applied correctly
 * - Cross-domain composition works (createMockReservation({ userId: createMockUser().id }))
 * - JWT payload is defined once and shared
 */

import { describe, it, expect } from "vitest";
import {
  // users
  createMockUser,
  createMockPaginatedResponse,
  // reservations
  createMockTable,
  createMockReservation,
  createMockPagination,
  // jwt
  createMockJWTPayload,
} from "../index.js";

describe("createMockUser", () => {
  it("returns an object with expected user fields", () => {
    const user = createMockUser();
    expect(user.id).toBe("user-123");
    expect(user.email).toBe("test@example.com");
    expect(user.emailVerified).toBe(true);
    expect(user.preferences.theme).toBe("light");
  });

  it("accepts overrides", () => {
    const user = createMockUser({ id: "user-456", email: "other@example.com" });
    expect(user.id).toBe("user-456");
    expect(user.email).toBe("other@example.com");
    expect(user.name).toBe("Test User"); // unchanged
  });

  it("returns a frozen object", () => {
    const user = createMockUser();
    expect(Object.isFrozen(user)).toBe(true);
  });

  it("does not mutate on repeated calls", () => {
    const a = createMockUser({ id: "user-a" });
    const b = createMockUser({ id: "user-b" });
    expect(a.id).toBe("user-a");
    expect(b.id).toBe("user-b");
  });
});

describe("createMockPaginatedResponse", () => {
  it("wraps data in a pagination envelope", () => {
    const result = createMockPaginatedResponse(["a", "b", "c"]);
    expect(result.data).toEqual(["a", "b", "c"]);
    expect(result.pagination.total).toBe(3);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.limit).toBe(10);
  });

  it("respects page/limit/total overrides", () => {
    const result = createMockPaginatedResponse(["x"], { page: 2, limit: 5, total: 20 });
    expect(result.pagination.page).toBe(2);
    expect(result.pagination.limit).toBe(5);
    expect(result.pagination.total).toBe(20);
    expect(result.pagination.totalPages).toBe(4);
    expect(result.pagination.hasNext).toBe(true);
    expect(result.pagination.hasPrev).toBe(true);
  });
});

describe("createMockTable", () => {
  it("returns a table with expected fields", () => {
    const table = createMockTable();
    expect(table.id).toBe("table-123");
    expect(table.capacity).toBe(4);
    expect(table.status).toBe("AVAILABLE");
  });

  it("accepts overrides", () => {
    const table = createMockTable({ id: "table-999", capacity: 8 });
    expect(table.id).toBe("table-999");
    expect(table.capacity).toBe(8);
  });

  it("returns a frozen object", () => {
    const table = createMockTable();
    expect(Object.isFrozen(table)).toBe(true);
  });
});

describe("createMockReservation", () => {
  it("returns a reservation with embedded table", () => {
    const res = createMockReservation();
    expect(res.id).toBe("res-123");
    expect(res.table.id).toBe("table-123");
    expect(res.guestName).toBe("John Doe");
  });

  it("supports cross-domain composition: links userId from createMockUser", () => {
    const user = createMockUser({ id: "user-xyz" });
    const res = createMockReservation({ userId: user.id });
    expect(res.userId).toBe("user-xyz");
  });

  it("allows table overrides via nested table key", () => {
    const res = createMockReservation({ table: { capacity: 6 } });
    expect(res.table.capacity).toBe(6);
  });

  it("returns a frozen object", () => {
    const res = createMockReservation();
    expect(Object.isFrozen(res)).toBe(true);
  });
});

describe("createMockPagination", () => {
  it("returns pagination defaults", () => {
    const p = createMockPagination();
    expect(p.page).toBe(1);
    expect(p.limit).toBe(10);
    expect(p.total).toBe(0);
    expect(p.hasNext).toBe(false);
  });

  it("accepts overrides", () => {
    const p = createMockPagination({ total: 50, page: 2 });
    expect(p.total).toBe(50);
    expect(p.page).toBe(2);
  });
});

describe("createMockJWTPayload", () => {
  it("returns a JWT with expected fields", () => {
    const jwt = createMockJWTPayload();
    expect(jwt.sub).toBe("auth0|user-123");
    expect(jwt.email).toBe("test@example.com");
    expect(jwt.email_verified).toBe(true);
    expect(jwt.iss).toContain("auth0");
    expect(jwt.permissions).toContain("admin");
  });

  it("accepts overrides", () => {
    const jwt = createMockJWTPayload({ sub: "auth0|other", email: "other@example.com" });
    expect(jwt.sub).toBe("auth0|other");
    expect(jwt.email).toBe("other@example.com");
  });

  it("returns a frozen object", () => {
    const jwt = createMockJWTPayload();
    expect(Object.isFrozen(jwt)).toBe(true);
  });
});
