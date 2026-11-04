import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/index.js";

vi.mock("../services/database.js", () => ({ db: { prisma: {} } }));
vi.mock("../services/lapsed-guest-cron.js", () => ({
  getAllVenueIds: vi.fn().mockResolvedValue(["v-ok", "v-bad", "v-err"]),
}));
vi.mock("../services/availability-migration.js", () => ({
  migrateVenue: vi.fn((_prisma: unknown, venueId: string) => {
    if (venueId === "v-ok") {
      return Promise.resolve({ venueId, outcome: "would_migrate", operatingHours: {} });
    }
    if (venueId === "v-bad") {
      return Promise.resolve({
        venueId,
        outcome: "unrecognised",
        reason: "unreadable_time",
        detail: "monday",
        operatingHours: {},
      });
    }
    return Promise.reject(new Error("boom"));
  }),
}));

const { runBackfill } = await import("./backfill-availability.js");
const { migrateVenue } = await import("../services/availability-migration.js");
const { getAllVenueIds } = await import("../services/lapsed-guest-cron.js");

describe("runBackfill", () => {
  it("lists unrecognised venues by id and reason, and errors separately", async () => {
    const lines: string[] = [];
    const summary = await runBackfill({} as PrismaClient, { apply: false }, (line) =>
      lines.push(line)
    );

    expect(summary.venues).toBe(3);
    expect(summary.counts).toEqual({ would_migrate: 1, unrecognised: 1 });
    expect(summary.unrecognised).toEqual([{ venueId: "v-bad", reason: "unreadable_time" }]);
    expect(summary.errors).toEqual([{ venueId: "v-err", message: "boom" }]);
    expect(lines).toHaveLength(3);
  });

  it("backfills a venue whose days differ as one regular schedule with day sets", async () => {
    const actual = await vi.importActual<{ migrateVenue: typeof migrateVenue }>(
      "../services/availability-migration.js"
    );
    const weekday = (open: string, close: string) => ({ open, close });
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $executeRawUnsafe: vi.fn().mockResolvedValue(0),
      venue: {
        findUnique: vi.fn().mockResolvedValue({
          operatingHours: {
            monday: weekday("11:00", "22:00"),
            tuesday: weekday("11:00", "22:00"),
            wednesday: weekday("11:00", "22:00"),
            thursday: weekday("11:00", "22:00"),
            friday: weekday("11:00", "23:00"),
            saturday: weekday("11:00", "23:00"),
            sunday: { ...weekday("10:00", "21:00"), closed: true },
          },
          settings: null,
          ianaTimezone: "America/New_York",
        }),
      },
      schedule: { count: vi.fn().mockResolvedValue(0), createMany: vi.fn() },
      venueService: { createMany: vi.fn() },
      scheduleService: { createMany: vi.fn() },
      scheduleAssignment: { createMany: vi.fn() },
      dateRule: { createMany: vi.fn() },
    };
    const prisma = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
    vi.mocked(getAllVenueIds).mockResolvedValueOnce(["v-real"]);
    vi.mocked(migrateVenue).mockImplementationOnce(actual.migrateVenue);

    const summary = await runBackfill(prisma as unknown as PrismaClient, { apply: true }, () => {});

    expect(summary.counts).toEqual({ migrated: 1 });
    const schedules = tx.schedule.createMany.mock.calls[0]![0].data;
    expect(schedules).toEqual([
      expect.objectContaining({ name: "Regular week", kind: "regular", isRegular: true }),
    ]);
    const rows = tx.scheduleService.createMany.mock.calls[0]![0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0].dayHours.sets).toEqual([expect.objectContaining({ weekdays: [5, 6] })]);
    expect(tx.scheduleAssignment.createMany.mock.calls[0]![0].data).toEqual([
      expect.objectContaining({ weekdays: [1, 2, 3, 4, 5, 6] }),
    ]);
  });
});
