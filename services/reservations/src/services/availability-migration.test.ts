import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/index.js";
import { migrateVenue, planVenueMigration } from "./availability-migration.js";

const NOW = new Date("2026-11-01T12:00:00Z");

const WEEKDAY_HOURS = {
  monday: { open: "11:00", close: "22:00" },
  tuesday: { open: "11:00", close: "22:00" },
  wednesday: { open: "11:00", close: "22:00" },
  thursday: { open: "11:00", close: "22:00" },
  friday: { open: "11:00", close: "23:00" },
  saturday: { open: "11:00", close: "23:00" },
  sunday: { open: "10:00", close: "21:00", closed: true },
};

const SEED_HOURS = [
  { dayOfWeek: 0, openTime: "10:00", closeTime: "21:00", isClosed: false },
  { dayOfWeek: 1, openTime: "11:00", closeTime: "22:00", isClosed: false },
];

function fakePrisma(venue: object | null, regularSchedules = 0) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    venue: { findUnique: vi.fn().mockResolvedValue(venue), update: vi.fn() },
    schedule: { count: vi.fn().mockResolvedValue(regularSchedules), createMany: vi.fn() },
    venueService: { createMany: vi.fn() },
    scheduleService: { createMany: vi.fn() },
    scheduleAssignment: { createMany: vi.fn() },
    dateRule: { createMany: vi.fn() },
  };
  const prisma = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
  return { prisma: prisma as unknown as PrismaClient, tx };
}

const venueRow = (operatingHours: unknown, settings: unknown = null) => ({
  operatingHours,
  settings,
  ianaTimezone: "America/New_York",
});

describe("planVenueMigration", () => {
  it("derives the legacy projection for either shape without changing the source", () => {
    const seed = planVenueMigration(venueRow(SEED_HOURS), NOW);
    expect(seed).toMatchObject({ kind: "migrate", shape: "seed_array" });
    expect(seed.kind === "migrate" && seed.projection.monday).toEqual({
      open: "11:00",
      close: "22:00",
    });
    expect(planVenueMigration(venueRow(WEEKDAY_HOURS), NOW)).toMatchObject({
      kind: "migrate",
      shape: "weekday",
    });
  });

  it("reports an unreadable time on an open day instead of reading it as closed", () => {
    const plan = planVenueMigration(
      venueRow({ monday: { open: "09:00:00", close: "17:00" } }),
      NOW
    );
    expect(plan).toMatchObject({ kind: "unrecognised", reason: "unreadable_time" });
    expect(plan.kind === "unrecognised" && plan.detail).toContain("09:00:00");
  });

  it("reports an unknown shape without producing rows", () => {
    expect(planVenueMigration(venueRow({ version: 9 }), NOW)).toMatchObject({
      kind: "unrecognised",
      reason: "unknown_version",
    });
    expect(planVenueMigration(venueRow(null), NOW)).toMatchObject({
      kind: "unrecognised",
      reason: "no_hours",
    });
  });
});

describe("planVenueMigration, strict vs lenient", () => {
  const MESSY = {
    ...WEEKDAY_HOURS,
    monday: { open: "", close: "22:00" },
    tuesday: { open: "09:00", close: "08:00" },
    wednesday: { open: "11:00:00", close: "22:00:00" },
  };

  it("stays strict for the backfill: one unreadable day leaves the venue unrecognised", () => {
    expect(planVenueMigration(venueRow(MESSY), NOW).kind).toBe("unrecognised");
  });

  it("in lenient mode closes the bad days and lists each in notes.unreadableDays", () => {
    const plan = planVenueMigration(venueRow(MESSY), NOW, undefined, { lenient: true });
    if (plan.kind !== "migrate") throw new Error(plan.reason);
    expect(plan.notes.unreadableDays).toEqual([
      expect.stringContaining("monday"),
      expect.stringContaining("tuesday"),
    ]);
    const assigned = plan.config.assignments.flatMap((a) => a.weekdays).sort();
    expect(assigned).toEqual([3, 4, 5, 6]); // Wed-Sat open; Sun closed; Mon/Tue closed as bad
  });
});

describe("migrateVenue", () => {
  it("writes every table inside the venue's RLS context", async () => {
    const { prisma, tx } = fakePrisma(venueRow(WEEKDAY_HOURS));
    const result = await migrateVenue(prisma, "v1", { apply: true, now: NOW });
    expect(result).toMatchObject({
      outcome: "migrated",
      shape: "weekday",
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1); // set_config('app.venue_id', …)
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith('SET LOCAL ROLE "app_reservations"');
    expect(
      tx.schedule.createMany.mock.calls[0]![0].data.every(
        (r: { venueId: string }) => r.venueId === "v1"
      )
    ).toBe(true);
    expect(tx.scheduleAssignment.createMany).toHaveBeenCalled();
    expect(tx.venue.update).not.toHaveBeenCalled();
  });

  it("never updates the venue row, whatever the legacy shape, and logs the original column", async () => {
    for (const hours of [SEED_HOURS, WEEKDAY_HOURS]) {
      const { prisma, tx } = fakePrisma(venueRow(hours));
      const result = await migrateVenue(prisma, "v1", { apply: true, now: NOW });
      expect(result).toMatchObject({ outcome: "migrated", operatingHours: hours });
      expect(tx.venue.update).not.toHaveBeenCalled();
    }
  });

  it("is idempotent: a venue with a regular schedule is not written again", async () => {
    const { prisma, tx } = fakePrisma(venueRow(WEEKDAY_HOURS), 1);
    expect(await migrateVenue(prisma, "v1", { apply: true, now: NOW })).toEqual({
      venueId: "v1",
      outcome: "already_migrated",
      operatingHours: WEEKDAY_HOURS,
    });
    expect(tx.schedule.createMany).not.toHaveBeenCalled();
  });

  it("leaves an unrecognised venue untouched and reports it", async () => {
    const { prisma, tx } = fakePrisma(venueRow({ hello: "world" }));
    expect(await migrateVenue(prisma, "v1", { apply: true, now: NOW })).toMatchObject({
      outcome: "unrecognised",
      reason: "unknown_shape",
      operatingHours: { hello: "world" },
    });
    expect(tx.schedule.createMany).not.toHaveBeenCalled();
    expect(tx.venue.update).not.toHaveBeenCalled();
  });

  it("writes nothing on a dry run", async () => {
    const { prisma, tx } = fakePrisma(venueRow(SEED_HOURS));
    expect(await migrateVenue(prisma, "v1", { apply: false, now: NOW })).toMatchObject({
      outcome: "would_migrate",
      operatingHours: SEED_HOURS,
      notes: { pastMidnightWindows: [] },
    });
    expect(tx.schedule.createMany).not.toHaveBeenCalled();
    expect(tx.venue.update).not.toHaveBeenCalled();
  });

  it("reports a missing venue", async () => {
    const { prisma } = fakePrisma(null);
    expect(await migrateVenue(prisma, "gone", { apply: true, now: NOW })).toEqual({
      venueId: "gone",
      outcome: "not_found",
    });
  });
});
