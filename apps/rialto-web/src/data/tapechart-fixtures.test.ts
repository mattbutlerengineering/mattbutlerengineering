import { describe, it, expect, vi, afterEach } from "vitest";
import { makeRooms, makeReservations, defaultDateRange } from "./tapechart-fixtures.js";

describe("makeRooms", () => {
  it("returns 30 rooms by default", () => {
    const rooms = makeRooms();
    expect(rooms).toHaveLength(30);
  });

  it("returns the requested count", () => {
    expect(makeRooms(5)).toHaveLength(5);
    expect(makeRooms(10)).toHaveLength(10);
  });

  it("each room has required fields", () => {
    const rooms = makeRooms(5);
    for (const room of rooms) {
      expect(room.id).toBeTruthy();
      expect(room.name).toBeTruthy();
      expect(room.category).toMatch(/^(Standard|Deluxe|Suite)$/);
      expect(typeof room.capacity).toBe("number");
      expect(room.capacity).toBeGreaterThan(0);
      expect(room.status).toBeTruthy();
    }
  });

  it("room IDs are unique", () => {
    const rooms = makeRooms(30);
    const ids = rooms.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("room IDs follow room-{number} pattern", () => {
    const rooms = makeRooms(5);
    for (const room of rooms) {
      expect(room.id).toMatch(/^room-\d+$/);
    }
  });

  it("categories are distributed correctly", () => {
    const rooms = makeRooms(20);
    const standard = rooms.filter((r) => r.category === "Standard");
    const deluxe = rooms.filter((r) => r.category === "Deluxe");
    const suite = rooms.filter((r) => r.category === "Suite");
    // Standard: first 50%, Deluxe: 50-85%, Suite: 85-100%
    expect(standard.length).toBe(10); // 50% of 20
    expect(deluxe.length).toBeGreaterThan(0);
    expect(suite.length).toBeGreaterThan(0);
  });

  it("Standard rooms have capacity 2", () => {
    const rooms = makeRooms(10);
    for (const room of rooms.filter((r) => r.category === "Standard")) {
      expect(room.capacity).toBe(2);
    }
  });

  it("Deluxe rooms have capacity 3", () => {
    const rooms = makeRooms(10);
    for (const room of rooms.filter((r) => r.category === "Deluxe")) {
      expect(room.capacity).toBe(3);
    }
  });

  it("Suite rooms have capacity 4", () => {
    const rooms = makeRooms(100);
    for (const room of rooms.filter((r) => r.category === "Suite")) {
      expect(room.capacity).toBe(4);
    }
  });

  it("is deterministic — same output on repeat calls", () => {
    const a = makeRooms(10);
    const b = makeRooms(10);
    expect(a).toEqual(b);
  });
});

describe("makeReservations", () => {
  it("returns an empty array when rangeDays <= 0", () => {
    const rooms = makeRooms(5);
    // Same start and end date
    expect(makeReservations(rooms, "2026-01-10", "2026-01-10")).toHaveLength(0);
    // End before start
    expect(makeReservations(rooms, "2026-01-15", "2026-01-10")).toHaveLength(0);
  });

  it("returns reservations for a valid date range", () => {
    const rooms = makeRooms(5);
    const reservations = makeReservations(rooms, "2026-01-01", "2026-01-15");
    expect(reservations.length).toBeGreaterThan(0);
  });

  it("each reservation references a valid room ID", () => {
    const rooms = makeRooms(10);
    const roomIds = new Set(rooms.map((r) => r.id));
    const reservations = makeReservations(rooms, "2026-01-01", "2026-01-15");
    for (const res of reservations) {
      expect(roomIds.has(res.roomId)).toBe(true);
    }
  });

  it("each reservation has required fields", () => {
    const rooms = makeRooms(5);
    const reservations = makeReservations(rooms, "2026-01-01", "2026-01-14");
    for (const res of reservations) {
      expect(res.id).toBeTruthy();
      expect(res.roomId).toBeTruthy();
      expect(res.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(res.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(res.status).toMatch(/^(confirmed|checkedIn|tentative)$/);
      expect(res.guestName).toBeTruthy();
      expect(res.partySize).toBeGreaterThan(0);
      expect(res.ratePerNight).toBeGreaterThan(0);
      expect(res.currency).toBe("USD");
      expect(res.source).toBeTruthy();
    }
  });

  it("reservation start is before end", () => {
    const rooms = makeRooms(10);
    const reservations = makeReservations(rooms, "2026-01-01", "2026-01-14");
    for (const res of reservations) {
      expect(res.start < res.end).toBe(true);
    }
  });

  it("reservation IDs are unique", () => {
    const rooms = makeRooms(10);
    const reservations = makeReservations(rooms, "2026-01-01", "2026-01-14");
    const ids = reservations.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is deterministic — same output on repeat calls", () => {
    const rooms = makeRooms(5);
    const a = makeReservations(rooms, "2026-01-01", "2026-01-14");
    const b = makeReservations(rooms, "2026-01-01", "2026-01-14");
    expect(a).toEqual(b);
  });

  it("returns no reservations when rooms is empty", () => {
    expect(makeReservations([], "2026-01-01", "2026-01-14")).toHaveLength(0);
  });

  it("density 0 produces no reservations", () => {
    const rooms = makeRooms(10);
    const reservations = makeReservations(rooms, "2026-01-01", "2026-01-30", 0);
    expect(reservations).toHaveLength(0);
  });
});

describe("defaultDateRange", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns an object with startDate and endDate strings", () => {
    const { startDate, endDate } = defaultDateRange();
    expect(startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("endDate is 14 days after startDate", () => {
    const { startDate, endDate } = defaultDateRange();
    const start = new Date(startDate + "T00:00:00Z");
    const end = new Date(endDate + "T00:00:00Z");
    const diffDays = (end.getTime() - start.getTime()) / 86400000;
    expect(diffDays).toBe(14);
  });

  it("startDate is always a Thursday (UTC)", () => {
    const { startDate } = defaultDateRange();
    const d = new Date(startDate + "T00:00:00Z");
    // Thursday is day 4 in UTC (0=Sun)
    expect(d.getUTCDay()).toBe(4);
  });

  it("is stable when called from a known Thursday", () => {
    // 2026-01-01 is a Thursday
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    const { startDate, endDate } = defaultDateRange();
    expect(startDate).toBe("2026-01-01");
    expect(endDate).toBe("2026-01-15");
    vi.useRealTimers();
  });

  it("rolls back to prior Thursday when called from a non-Thursday", () => {
    // 2026-01-05 is a Monday (day 1) — should roll back to 2025-12-25 (Thursday)
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-05T12:00:00Z"));
    const { startDate } = defaultDateRange();
    const d = new Date(startDate + "T00:00:00Z");
    expect(d.getUTCDay()).toBe(4); // Must be a Thursday
    vi.useRealTimers();
  });
});
