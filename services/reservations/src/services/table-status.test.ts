import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Reservation } from "@mbe/types";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      table: {
        findMany: vi.fn(),
      },
      reservation: {
        findMany: vi.fn(),
      },
    },
  });
});

import { selectCurrentReservation, tableStatusService } from "./table-status.js";
import { prisma } from "./database.js";

const VENUE_ID = "venue-1";
const NOW = new Date("2026-05-05T18:00:00Z"); // 18:00 UTC

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res-1",
    date: "2026-05-05",
    startTime: "2026-05-05T17:00:00Z",
    endTime: "2026-05-05T18:30:00Z",
    partySize: 2,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Guest",
    guestEmail: null,
    guestPhone: null,
    guestId: null,
    userId: null,
    occasion: null,
    seatingPreference: null,
    tableId: "table-1",
    venueId: VENUE_ID,
    createdAt: "2026-05-01T00:00:00Z",
    updatedAt: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

function makePrismaReservationRow(overrides: Partial<Reservation> = {}) {
  const r = makeReservation(overrides);
  return {
    id: r.id,
    date: new Date(r.date),
    startTime: new Date(r.startTime),
    endTime: new Date(r.endTime),
    partySize: r.partySize,
    status: r.status,
    notes: r.notes,
    cancellationReason: r.cancellationReason,
    cancellationNote: r.cancellationNote,
    occasion: r.occasion,
    seatingPreference: r.seatingPreference,
    guestName: r.guestName,
    guestEmail: r.guestEmail,
    guestPhone: r.guestPhone,
    guestId: r.guestId,
    userId: r.userId,
    tableId: r.tableId,
    venueId: r.venueId,
    createdAt: new Date(r.createdAt),
    updatedAt: new Date(r.updatedAt),
  };
}

describe("selectCurrentReservation", () => {
  it("returns null for an empty list", () => {
    expect(selectCurrentReservation([], NOW)).toBeNull();
  });

  it("returns the reservation currently underway (startTime <= now)", () => {
    const active = makeReservation({ id: "active", startTime: "2026-05-05T17:30:00Z" });
    expect(selectCurrentReservation([active], NOW)).toBe(active);
  });

  it("picks the most recently started reservation when several have already started", () => {
    const earlier = makeReservation({ id: "earlier", startTime: "2026-05-05T15:00:00Z" });
    const later = makeReservation({ id: "later", startTime: "2026-05-05T17:45:00Z" });
    expect(selectCurrentReservation([earlier, later], NOW)).toBe(later);
  });

  it("falls back to the soonest upcoming reservation when none have started yet", () => {
    const soon = makeReservation({ id: "soon", startTime: "2026-05-05T18:15:00Z" });
    const later = makeReservation({ id: "later", startTime: "2026-05-05T19:00:00Z" });
    expect(selectCurrentReservation([later, soon], NOW)).toBe(soon);
  });

  it("prefers an underway reservation over an upcoming one", () => {
    const underway = makeReservation({ id: "underway", startTime: "2026-05-05T17:00:00Z" });
    const upcoming = makeReservation({ id: "upcoming", startTime: "2026-05-05T19:00:00Z" });
    expect(selectCurrentReservation([upcoming, underway], NOW)).toBe(underway);
  });
});

describe("tableStatusService.getSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 'available' for a table with no reservations today", async () => {
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce([{ id: "table-1" }] as never);
    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([]);

    const snapshot = await tableStatusService.getSnapshot(VENUE_ID, NOW);

    expect(snapshot).toEqual([{ tableId: "table-1", status: "available" }]);
  });

  it("returns 'seated' for a table with a reservation underway now", async () => {
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce([{ id: "table-1" }] as never);
    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([
      makePrismaReservationRow({ startTime: "2026-05-05T17:30:00Z", status: "CONFIRMED" }),
    ] as never);

    const snapshot = await tableStatusService.getSnapshot(VENUE_ID, NOW);

    expect(snapshot).toEqual([{ tableId: "table-1", status: "seated" }]);
  });

  it("derives per-table status independently across multiple tables", async () => {
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce([
      { id: "table-1" },
      { id: "table-2" },
    ] as never);
    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([
      makePrismaReservationRow({
        tableId: "table-1",
        startTime: "2026-05-05T17:30:00Z",
        status: "CONFIRMED",
      }),
      makePrismaReservationRow({
        tableId: "table-2",
        startTime: "2026-05-05T12:00:00Z",
        endTime: "2026-05-05T13:30:00Z",
        status: "COMPLETED",
      }),
    ] as never);

    const snapshot = await tableStatusService.getSnapshot(VENUE_ID, NOW);

    expect(snapshot).toEqual([
      { tableId: "table-1", status: "seated" },
      { tableId: "table-2", status: "needs-bussing" },
    ]);
  });

  it("queries tables and today's non-cancelled reservations scoped to the venue", async () => {
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([]);

    await tableStatusService.getSnapshot(VENUE_ID, NOW);

    expect(prisma.table.findMany).toHaveBeenCalledWith({
      where: { venueId: VENUE_ID },
      select: { id: true },
    });
    expect(prisma.reservation.findMany).toHaveBeenCalledWith({
      where: {
        venueId: VENUE_ID,
        date: new Date("2026-05-05"),
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
      },
    });
  });
});
