import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/index.js";
import { DEMO_VENUE_ID, DEMO_VENUE_SLUG, ensureDemoVenue } from "./demo-venue.js";

function fakePrisma(existingSchedules = 0) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    venueGroup: { upsert: vi.fn().mockResolvedValue({ id: "g1" }) },
    venue: { upsert: vi.fn().mockResolvedValue({ id: DEMO_VENUE_ID }) },
    schedule: {
      count: vi.fn().mockResolvedValue(existingSchedules),
      createMany: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: "s" }),
    },
    venueService: { createMany: vi.fn(), create: vi.fn().mockResolvedValue({ id: "v" }) },
    scheduleService: { createMany: vi.fn() },
    scheduleAssignment: { createMany: vi.fn() },
    dateRule: { createMany: vi.fn() },
  };
  const prisma = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
  return { prisma: prisma as unknown as PrismaClient, tx };
}

describe("ensureDemoVenue", () => {
  it("uses the canonical slug", () => {
    expect(DEMO_VENUE_SLUG).toBe("demo-bistro");
  });

  it("sets venue context before upserting the venue, keyed on slug", async () => {
    const { prisma, tx } = fakePrisma();
    await ensureDemoVenue(prisma);
    const ctxOrder = tx.$executeRaw.mock.invocationCallOrder[0] ?? Infinity;
    const venueOrder = tx.venue.upsert.mock.invocationCallOrder[0] ?? 0;
    expect(ctxOrder).toBeLessThan(venueOrder);
    expect(tx.venue.upsert).toHaveBeenCalledTimes(1);
    const args = tx.venue.upsert.mock.calls[0]?.[0];
    expect(args.where).toEqual({ id: DEMO_VENUE_ID });
    expect(args.create.slug).toBe("demo-bistro");
    expect(args.update).toEqual({});
  });

  it("writes availability rows once and skips them when already present", async () => {
    const first = fakePrisma(0);
    await ensureDemoVenue(first.prisma);
    expect(first.tx.schedule.count).toHaveBeenCalled();
    expect(
      first.tx.schedule.createMany.mock.calls.length + first.tx.schedule.create.mock.calls.length
    ).toBeGreaterThan(0);

    const again = fakePrisma(1);
    await ensureDemoVenue(again.prisma);
    expect(again.tx.schedule.createMany).not.toHaveBeenCalled();
    expect(again.tx.schedule.create).not.toHaveBeenCalled();
  });
});
