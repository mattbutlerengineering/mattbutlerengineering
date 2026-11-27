import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/index.js";
import { DEMO_VENUE_ID, DEMO_VENUE_SLUG, ensureDemoVenue } from "./demo-venue.js";

function fakePrisma(existingSchedules = 0, existingPlan = false, existingMenus = 0) {
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
    floorPlan: {
      findFirst: vi.fn().mockResolvedValue(existingPlan ? { id: "fp1", isActive: true } : null),
      create: vi.fn().mockResolvedValue({ id: "fp1" }),
    },
    table: { upsert: vi.fn().mockResolvedValue({ id: "t" }) },
    menu: {
      count: vi.fn().mockResolvedValue(existingMenus),
      create: vi.fn().mockResolvedValue({ id: "m1" }),
    },
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

  it("creates one active floor plan and attaches every table to it", async () => {
    const { prisma, tx } = fakePrisma();
    await ensureDemoVenue(prisma);
    expect(tx.floorPlan.create).toHaveBeenCalledTimes(1);
    expect(tx.floorPlan.create.mock.calls[0]?.[0].data).toMatchObject({
      venueId: DEMO_VENUE_ID,
      isActive: true,
    });
    for (const call of tx.table.upsert.mock.calls) {
      expect(call[0].create.floorPlanId).toBe("fp1");
      expect(call[0].create.venueId).toBe(DEMO_VENUE_ID);
    }
  });

  it("seeds tables for parties of 2, 4, 6 and 10 with positions", async () => {
    const { prisma, tx } = fakePrisma();
    await ensureDemoVenue(prisma);
    const created = tx.table.upsert.mock.calls.map((c) => c[0].create);
    const caps = new Set(created.map((t) => t.capacity));
    for (const c of [2, 4, 6, 10]) expect(caps.has(c)).toBe(true);
    for (const t of created) {
      expect(t.minCovers).toBeLessThanOrEqual(t.maxCovers);
      expect(typeof t.shapeMetadata.x).toBe("number");
      expect(typeof t.shapeMetadata.y).toBe("number");
    }
  });

  it("is idempotent: upserts tables by name and reuses an existing floor plan", async () => {
    const first = fakePrisma();
    await ensureDemoVenue(first.prisma);
    const again = fakePrisma(1, true);
    await ensureDemoVenue(again.prisma);
    expect(again.tx.floorPlan.create).not.toHaveBeenCalled();
    expect(again.tx.table.upsert.mock.calls.length).toBe(first.tx.table.upsert.mock.calls.length);
    for (const call of again.tx.table.upsert.mock.calls) {
      expect(call[0].where).toEqual({
        venueId_name: { venueId: DEMO_VENUE_ID, name: call[0].create.name },
      });
      expect(call[0].update).toEqual({});
    }
    const names = first.tx.table.upsert.mock.calls.map((c) => c[0].create.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("creates one published menu with sections and priced items when the venue has none", async () => {
    const { prisma, tx } = fakePrisma();
    await ensureDemoVenue(prisma);
    expect(tx.menu.count).toHaveBeenCalledWith({ where: { venueId: DEMO_VENUE_ID } });
    expect(tx.menu.create).toHaveBeenCalledTimes(1);
    const data = tx.menu.create.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ venueId: DEMO_VENUE_ID, status: "ACTIVE" });
    expect(data.slug).toBeTruthy();
    const sections = data.sections.create;
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      expect(section.venueId).toBe(DEMO_VENUE_ID);
      expect(section.items.create.length).toBeGreaterThan(0);
      for (const item of section.items.create) {
        expect(item.venueId).toBe(DEMO_VENUE_ID);
        expect(item.priceCents).toBeGreaterThan(0);
      }
    }
  });

  it("does not create a second menu when the venue already has one", async () => {
    const { prisma, tx } = fakePrisma(1, true, 1);
    await ensureDemoVenue(prisma);
    expect(tx.menu.create).not.toHaveBeenCalled();
  });
});
