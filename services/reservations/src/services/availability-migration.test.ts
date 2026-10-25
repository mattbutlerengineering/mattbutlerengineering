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
  it("leaves a weekday-keyed column alone and rewrites a seed-array column", () => {
    const weekday = planVenueMigration(venueRow(WEEKDAY_HOURS), NOW);
    const seed = planVenueMigration(venueRow(SEED_HOURS), NOW);
    expect(weekday).toMatchObject({ kind: "migrate", shape: "weekday", projection: null });
    expect(seed).toMatchObject({ kind: "migrate", shape: "seed_array" });
    expect(seed.kind === "migrate" && seed.projection?.monday).toEqual({
      open: "11:00",
      close: "22:00",
    });
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

describe("migrateVenue", () => {
  it("writes every table inside the venue's RLS context", async () => {
    const { prisma, tx } = fakePrisma(venueRow(WEEKDAY_HOURS));
    const result = await migrateVenue(prisma, "v1", { apply: true, now: NOW });
    expect(result).toMatchObject({
      outcome: "migrated",
      shape: "weekday",
      legacyColumnRewritten: false,
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

  it("rewrites the legacy column for a seed-array venue", async () => {
    const { prisma, tx } = fakePrisma(venueRow(SEED_HOURS));
    const result = await migrateVenue(prisma, "v1", { apply: true, now: NOW });
    expect(result).toMatchObject({ outcome: "migrated", legacyColumnRewritten: true });
    expect(tx.venue.update).toHaveBeenCalledWith({
      where: { id: "v1" },
      data: {
        operatingHours: expect.objectContaining({ monday: { open: "11:00", close: "22:00" } }),
      },
    });
  });

  it("is idempotent: a venue with a regular schedule is not written again", async () => {
    const { prisma, tx } = fakePrisma(venueRow(WEEKDAY_HOURS), 1);
    expect(await migrateVenue(prisma, "v1", { apply: true, now: NOW })).toEqual({
      venueId: "v1",
      outcome: "already_migrated",
    });
    expect(tx.schedule.createMany).not.toHaveBeenCalled();
  });

  it("leaves an unrecognised venue untouched and reports it", async () => {
    const { prisma, tx } = fakePrisma(venueRow({ hello: "world" }));
    expect(await migrateVenue(prisma, "v1", { apply: true, now: NOW })).toMatchObject({
      outcome: "unrecognised",
      reason: "unknown_shape",
    });
    expect(tx.schedule.createMany).not.toHaveBeenCalled();
    expect(tx.venue.update).not.toHaveBeenCalled();
  });

  it("writes nothing on a dry run", async () => {
    const { prisma, tx } = fakePrisma(venueRow(SEED_HOURS));
    expect(await migrateVenue(prisma, "v1", { apply: false, now: NOW })).toMatchObject({
      outcome: "would_migrate",
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
