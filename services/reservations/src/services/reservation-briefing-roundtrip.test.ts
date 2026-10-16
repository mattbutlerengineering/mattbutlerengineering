/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Round-trip regression for #6597: a reservation written through the real
 * reservation service must surface its occasion and seating preference in the
 * real briefing service's output. The database is an in-memory store (not a
 * pinned create-call assertion), so a write path that drops the fields leaves
 * the Briefing null — exactly the failure that shipped unnoticed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const store = vi.hoisted(() => ({ rows: [] as Array<Record<string, any>> }));

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  const NOW = new Date("2026-05-01T12:00:00Z");
  const table = {
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
  const hydrate = (data: Record<string, any>) => ({
    id: `res-${store.rows.length + 1}`,
    status: "CONFIRMED",
    cancellationReason: null,
    cancellationNote: null,
    createdAt: NOW,
    updatedAt: NOW,
    table,
    guest: null,
    occasion: null,
    seatingPreference: null,
    ...data,
  });
  return createMockDatabaseService({
    prisma: {
      reservation: {
        create: vi.fn(async ({ data }: { data: Record<string, any> }) => {
          const row = hydrate(data);
          store.rows.push(row);
          return row;
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: object }) => {
          const index = store.rows.findIndex((r) => r.id === where.id);
          store.rows[index] = { ...store.rows[index], ...data };
          return store.rows[index];
        }),
        findMany: vi.fn(async () => store.rows),
      },
    },
  });
});

import { reservationService } from "./reservation.js";
import { briefingService } from "./briefing.js";

const request = {
  date: "2026-05-15",
  startTime: "2026-05-15T19:00:00Z",
  endTime: "2026-05-15T20:30:00Z",
  partySize: 2,
  tableId: "table-1",
  venueId: "venue-1",
  guestName: "Dana",
};

describe("occasion and seatingPreference reach the Briefing (#6597)", () => {
  beforeEach(() => {
    store.rows.length = 0;
  });

  it("a created reservation's occasion and seating preference appear in the Briefing", async () => {
    await reservationService.create({
      ...request,
      occasion: "birthday",
      seatingPreference: "booth",
    });

    const [entry] = await briefingService.getBriefing({ date: "2026-05-15", venueId: "venue-1" });

    expect(entry!.occasion).toBe("birthday");
    expect(entry!.seatingPreference).toBe("booth");
  });

  it("an update after creation changes what the Briefing shows", async () => {
    const created = await reservationService.create(request);

    await reservationService.update(created.id, {
      occasion: "anniversary",
      seatingPreference: "window",
    });

    const [entry] = await briefingService.getBriefing({ date: "2026-05-15", venueId: "venue-1" });
    expect(entry!.occasion).toBe("anniversary");
    expect(entry!.seatingPreference).toBe("window");
  });

  it("a reservation created without them still briefs as null, not undefined", async () => {
    await reservationService.create(request);

    const [entry] = await briefingService.getBriefing({ date: "2026-05-15", venueId: "venue-1" });
    expect(entry!.occasion).toBeNull();
    expect(entry!.seatingPreference).toBeNull();
  });
});
