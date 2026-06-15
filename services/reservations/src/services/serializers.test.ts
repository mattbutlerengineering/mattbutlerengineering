import { describe, it, expect } from "vitest";
import { toReservation, toTable } from "./serializers.js";

const NOW = new Date("2026-06-14T18:00:00Z");

function makePrismaTable() {
  return {
    id: "table-1",
    name: "Table 1",
    tableNumber: "1",
    capacity: 4,
    minCovers: 1,
    maxCovers: 6,
    location: "Main Floor",
    isActive: true,
    priority: 0,
    status: "AVAILABLE",
    venueId: "venue-1",
    floorPlanId: null,
    shapeMetadata: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makePrismaReservation(overrides: Record<string, unknown> = {}) {
  return {
    id: "res-1",
    date: new Date("2026-06-14"),
    startTime: new Date("2026-06-14T19:00:00Z"),
    endTime: new Date("2026-06-14T21:00:00Z"),
    partySize: 2,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    occasion: null,
    seatingPreference: null,
    guestName: "Jane Doe",
    guestEmail: "jane@example.com",
    guestPhone: null,
    guestId: null,
    userId: null,
    tableId: "table-1",
    table: makePrismaTable(),
    guest: null,
    venueId: "venue-1",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("toTable", () => {
  it("maps a Prisma table row to a domain Table", () => {
    const result = toTable(makePrismaTable());

    expect(result.id).toBe("table-1");
    expect(result.name).toBe("Table 1");
    expect(result.status).toBe("AVAILABLE");
    expect(result.createdAt).toBe(NOW.toISOString());
    expect(result.updatedAt).toBe(NOW.toISOString());
  });
});

describe("toReservation", () => {
  it("maps a Prisma reservation row to a domain Reservation", () => {
    const result = toReservation(makePrismaReservation());

    expect(result.id).toBe("res-1");
    expect(result.status).toBe("CONFIRMED");
    expect(result.guestName).toBe("Jane Doe");
    expect(result.date).toBe("2026-06-14");
    expect(result.startTime).toBe(new Date("2026-06-14T19:00:00Z").toISOString());
    expect(result.createdAt).toBe(NOW.toISOString());
  });

  it("includes mapped table when present", () => {
    const result = toReservation(makePrismaReservation());

    expect(result.table).toBeDefined();
    expect(result.table!.id).toBe("table-1");
    expect(result.table!.createdAt).toBe(NOW.toISOString());
  });

  it("omits table when not present", () => {
    const result = toReservation(makePrismaReservation({ table: undefined }));
    expect(result.table).toBeUndefined();
  });

  // Regression: confirm-hold (public booking path) previously omitted the guest field
  it("includes guest field when guest relation is present", () => {
    const reservation = makePrismaReservation({
      guest: { visitCount: 3, communicationPreference: "email_only" },
    });
    const result = toReservation(reservation);

    expect(result.guest).toEqual({
      visitCount: 3,
      communicationPreference: "email_only",
    });
  });

  it("sets guest to null when guest relation is null", () => {
    const result = toReservation(makePrismaReservation({ guest: null }));
    expect(result.guest).toBeNull();
  });

  it("sets guest to undefined when guest relation is absent", () => {
    const { guest: _guest, ...withoutGuest } = makePrismaReservation();
    const result = toReservation(withoutGuest as Parameters<typeof toReservation>[0]);
    // When no guest key exists, the property should be absent or null
    expect(result.guest == null).toBe(true);
  });
});
