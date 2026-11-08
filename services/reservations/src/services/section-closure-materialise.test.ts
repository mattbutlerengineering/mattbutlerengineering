import { describe, expect, it, vi } from "vitest";
import { materialiseSectionClosures, type MaterialiseDb } from "./section-closure-materialise.js";

const NOW = new Date("2026-11-07T12:00:00.000Z");

function makeDb(opts: {
  rules: { id: string; sectionId: string }[];
  tables: { id: string; sectionId: string | null }[];
  timezone?: string;
}) {
  const db = {
    venue: {
      findUnique: vi.fn(async () => ({ ianaTimezone: opts.timezone ?? "UTC" })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    dateRule: {
      findMany: vi.fn(async () => opts.rules),
      updateMany: vi.fn(async () => ({ count: opts.rules.length })),
    },
    table: { findMany: vi.fn(async () => opts.tables) },
    dateRuleTable: { createMany: vi.fn(async () => ({ count: 0 })) },
  };
  return db;
}
const asDb = (db: ReturnType<typeof makeDb>) => db as unknown as MaterialiseDb;

describe("materialiseSectionClosures", () => {
  it("looks only for the venue's live rules of those sections", async () => {
    const db = makeDb({ rules: [], tables: [] });
    await materialiseSectionClosures(asDb(db), "v1", ["sec-a"], NOW);
    expect(db.dateRule.findMany).toHaveBeenCalledWith({
      where: {
        venueId: "v1",
        sectionId: { in: ["sec-a"] },
        deletedAt: null,
        // Live: open-ended, or ending today or later (an expired closure is left as it is).
        OR: [{ endsOn: null }, { endsOn: { gte: new Date("2026-11-07T00:00:00.000Z") } }],
      },
      select: { id: true, sectionId: true },
    });
  });

  it("writes a join row per table of the section, then nulls sectionId", async () => {
    const db = makeDb({
      rules: [{ id: "dr-bar", sectionId: "sec-a" }],
      tables: [
        { id: "t1", sectionId: "sec-a" },
        { id: "t2", sectionId: "sec-a" },
      ],
    });
    await materialiseSectionClosures(asDb(db), "v1", ["sec-a"], NOW);
    expect(db.dateRuleTable.createMany).toHaveBeenCalledWith({
      data: [
        { dateRuleId: "dr-bar", tableId: "t1", venueId: "v1" },
        { dateRuleId: "dr-bar", tableId: "t2", venueId: "v1" },
      ],
      skipDuplicates: true,
    });
    expect(db.dateRule.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["dr-bar"] }, venueId: "v1" },
      data: { sectionId: null },
    });
  });

  it("bumps the availability version so a stale editor save is refused", async () => {
    const db = makeDb({
      rules: [{ id: "dr-bar", sectionId: "sec-a" }],
      tables: [{ id: "t1", sectionId: "sec-a" }],
    });
    await materialiseSectionClosures(asDb(db), "v1", ["sec-a"], NOW);
    expect(db.venue.updateMany).toHaveBeenCalledWith({
      where: { id: "v1" },
      data: { availabilityVersion: { increment: 1 } },
    });
  });

  it("does nothing when no live closure names the section", async () => {
    const db = makeDb({ rules: [], tables: [{ id: "t1", sectionId: "sec-a" }] });
    await materialiseSectionClosures(asDb(db), "v1", ["sec-a"], NOW);
    expect(db.dateRuleTable.createMany).not.toHaveBeenCalled();
    expect(db.dateRule.updateMany).not.toHaveBeenCalled();
    expect(db.venue.updateMany).not.toHaveBeenCalled();
  });

  it("does not query at all for no sections", async () => {
    const db = makeDb({ rules: [], tables: [] });
    await materialiseSectionClosures(asDb(db), "v1", [], NOW);
    expect(db.dateRule.findMany).not.toHaveBeenCalled();
  });

  it("reads today in the venue's own zone", async () => {
    // 02:00 UTC on 7 Nov is still 6 Nov in Los Angeles.
    const db = makeDb({ rules: [], tables: [], timezone: "America/Los_Angeles" });
    await materialiseSectionClosures(asDb(db), "v1", ["sec-a"], new Date("2026-11-07T02:00:00Z"));
    const where = (
      db.dateRule.findMany.mock.calls[0] as unknown as [{ where: { OR: unknown[] } }]
    )[0].where;
    expect(where.OR[1]).toEqual({ endsOn: { gte: new Date("2026-11-06T00:00:00.000Z") } });
  });
});
