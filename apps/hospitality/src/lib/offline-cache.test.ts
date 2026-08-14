import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { Reservation } from "@mbe/types";
import type { FloorPlanSnapshot } from "./offline-cache.js";
import {
  getCachedReservations,
  setCachedReservations,
  getCachedFloorPlanSnapshot,
  setCachedFloorPlanSnapshot,
  evictStaleEntries,
} from "./offline-cache.js";

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res-1",
    date: "2026-08-15",
    startTime: "18:00",
    endTime: "19:30",
    partySize: 2,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Ada Lovelace",
    guestEmail: null,
    guestPhone: null,
    guestId: null,
    userId: null,
    occasion: null,
    seatingPreference: null,
    tableId: "table-1",
    venueId: "venue-1",
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    ...overrides,
  };
}

function makeFloorPlanSnapshot(): FloorPlanSnapshot {
  return [
    {
      id: "fp-1",
      venueId: "venue-1",
      name: "Main Room",
      isActive: true,
      layoutJson: { width: 800, height: 600 },
      createdAt: "2026-08-14T00:00:00.000Z",
      updatedAt: "2026-08-14T00:00:00.000Z",
    },
  ];
}

beforeEach(() => {
  // Fresh in-memory IndexedDB per test so caches never leak across tests.
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("offline-cache: reservations", () => {
  it("round-trips setCachedReservations -> getCachedReservations for a venueId+date", async () => {
    const reservations = [makeReservation()];

    await setCachedReservations("venue-1", "2026-08-15", reservations);
    const result = await getCachedReservations("venue-1", "2026-08-15");

    expect(result).toEqual(reservations);
  });

  it("returns null when nothing is cached for the venueId+date", async () => {
    const result = await getCachedReservations("venue-missing", "2026-08-15");

    expect(result).toBeNull();
  });

  it("keeps reservations cached under different venueIds separate", async () => {
    await setCachedReservations("venue-1", "2026-08-15", [makeReservation({ id: "res-1" })]);
    await setCachedReservations("venue-2", "2026-08-15", [makeReservation({ id: "res-2" })]);

    const venue1Result = await getCachedReservations("venue-1", "2026-08-15");
    const venue2Result = await getCachedReservations("venue-2", "2026-08-15");

    expect(venue1Result?.[0]?.id).toBe("res-1");
    expect(venue2Result?.[0]?.id).toBe("res-2");
  });
});

describe("offline-cache: floor plan snapshot", () => {
  it("round-trips setCachedFloorPlanSnapshot -> getCachedFloorPlanSnapshot for a venueId", async () => {
    const snapshot = makeFloorPlanSnapshot();

    await setCachedFloorPlanSnapshot("venue-1", snapshot);
    const result = await getCachedFloorPlanSnapshot("venue-1");

    expect(result).toEqual(snapshot);
  });

  it("returns null when nothing is cached for the venueId", async () => {
    const result = await getCachedFloorPlanSnapshot("venue-missing");

    expect(result).toBeNull();
  });
});

describe("offline-cache: evictStaleEntries", () => {
  it("removes reservation entries cached under a different date and leaves today's intact", async () => {
    await setCachedReservations("venue-1", "2026-08-14", [makeReservation({ date: "2026-08-14" })]);
    await setCachedReservations("venue-1", "2026-08-15", [makeReservation({ date: "2026-08-15" })]);

    await evictStaleEntries("2026-08-15");

    const stale = await getCachedReservations("venue-1", "2026-08-14");
    const fresh = await getCachedReservations("venue-1", "2026-08-15");
    expect(stale).toBeNull();
    expect(fresh).not.toBeNull();
  });

  it("removes floor-plan snapshot entries cached under a different date and leaves today's intact", async () => {
    // Only the `Date` global is faked — fake-indexeddb schedules its own
    // internal work via real timers, so faking those too hangs every request.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-14T12:00:00.000Z"));
    await setCachedFloorPlanSnapshot("venue-1", makeFloorPlanSnapshot());

    vi.setSystemTime(new Date("2026-08-15T12:00:00.000Z"));
    await setCachedFloorPlanSnapshot("venue-2", makeFloorPlanSnapshot());

    await evictStaleEntries("2026-08-15");

    const stale = await getCachedFloorPlanSnapshot("venue-1");
    const fresh = await getCachedFloorPlanSnapshot("venue-2");
    expect(stale).toBeNull();
    expect(fresh).not.toBeNull();
  });
});
