import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      venue: { findUnique: vi.fn() },
      table: { findMany: vi.fn() },
      reservation: { findMany: vi.fn(), findFirst: vi.fn(), aggregate: vi.fn() },
      reservationHold: { findMany: vi.fn(), findFirst: vi.fn(), aggregate: vi.fn() },
      schedule: { findMany: vi.fn() },
      venueService: { findMany: vi.fn() },
      scheduleService: { findMany: vi.fn() },
      scheduleAssignment: { findMany: vi.fn() },
      dateRule: { findMany: vi.fn() },
    },
  });
});

import type { PrismaClient } from "../generated/prisma/index.js";
import { availabilityService } from "./availability.js";
import { prisma } from "./database.js";
import { DEMO_VENUE_ID, ensureDemoVenue } from "./demo-venue.js";

/** Runs the seeder against a recording fake and returns what it wrote for the venue and tables. */
async function seededRows() {
  const venueCreate: Record<string, unknown>[] = [];
  const tableCreate: Record<string, unknown>[] = [];
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    venueGroup: { upsert: vi.fn().mockResolvedValue({ id: "g1" }) },
    venue: {
      upsert: vi.fn(async (a: { create: Record<string, unknown> }) => {
        venueCreate.push(a.create);
        return { id: DEMO_VENUE_ID, settings: a.create.settings };
      }),
    },
    schedule: { count: vi.fn().mockResolvedValue(1) },
    floorPlan: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "fp1" }),
    },
    table: {
      upsert: vi.fn(async (a: { create: Record<string, unknown> }) => {
        tableCreate.push(a.create);
        return {};
      }),
    },
    menu: { count: vi.fn().mockResolvedValue(1), create: vi.fn() },
  };
  const db = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } as unknown as PrismaClient;
  await ensureDemoVenue(db);
  return { venue: venueCreate[0]!, tables: tableCreate };
}

// Fixed clock (a Friday): every date below is relative to this instant.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));
  for (const d of [
    prisma.reservation,
    prisma.reservationHold,
    prisma.schedule,
    prisma.venueService,
    prisma.scheduleService,
    prisma.scheduleAssignment,
    prisma.dateRule,
  ]) {
    vi.mocked(d.findMany).mockResolvedValue([] as never);
  }
});
afterEach(() => vi.useRealTimers());

async function slotsFor(date: string, partySize: number) {
  const { venue, tables } = await seededRows();
  vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({
    id: DEMO_VENUE_ID,
    ...venue,
  } as never);
  vi.mocked(prisma.table.findMany).mockResolvedValueOnce(
    tables.map((t, i) => ({ id: `t${i}`, isActive: true, status: "AVAILABLE", ...t })) as never
  );
  vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);
  vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([] as never);
  return availabilityService.generateTimeSlots(DEMO_VENUE_ID, date, partySize);
}

describe("demo venue availability", () => {
  it("offers slots on a future open day for a party of 2", async () => {
    expect((await slotsFor("2026-05-05", 2)).length).toBeGreaterThan(0);
  });

  it("offers slots for every party size 1-8", async () => {
    for (const size of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect((await slotsFor("2026-05-06", size)).length).toBeGreaterThan(0);
    }
  });

  it("offers no slots on a closed day", async () => {
    expect(await slotsFor("2026-05-04", 2)).toEqual([]);
  });

  it("offers the last day of the 30-day window but nothing past it", async () => {
    expect((await slotsFor("2026-05-29", 2)).length).toBeGreaterThan(0);
    expect(await slotsFor("2026-06-15", 2)).toEqual([]);
  });
});
