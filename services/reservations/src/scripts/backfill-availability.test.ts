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
});
