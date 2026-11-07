import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveDay } from "@mbe/availability";
import type { AvailabilityConfig } from "@mbe/types";
import { PrismaClient } from "../generated/prisma/index.js";
import { getAvailabilityConfig } from "../services/availability-config.js";
import { readStoredConfig } from "../services/availability-config-rows.js";
import { runWithVenueContext } from "../services/venue-context-store.js";
import { withVenueScopedQueries } from "../services/venue-scoped-prisma.js";
import { collapseVenue } from "./collapse-day-named-schedules.js";

/**
 * The collapse script on a real Postgres: a venue backfilled in the old shape (regular Mon–Wed plus
 * "Thu–Fri hours") resolves the same on every weekday before and after `--apply`, the folded
 * schedule is archived, and the venue is still "carried over" (rows and no change).
 *
 * Skips when `DATABASE_URL` is unset; run it against a freshly migrated throwaway Docker Postgres.
 * Shares the FORCE-toggling suites' advisory lock.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const RLS_SUITE_LOCK_KEY = 5369;

// 2026-11-01 is a Sunday; the week after it covers every weekday.
const WEEK = [
  "2026-11-01",
  "2026-11-02",
  "2026-11-03",
  "2026-11-04",
  "2026-11-05",
  "2026-11-06",
  "2026-11-07",
];
const NOW = new Date("2026-11-03T12:00:00.000Z");

describe.skipIf(!DATABASE_URL)("collapse-day-named-schedules (real Postgres)", () => {
  const venueId = `collapse-it-${randomUUID()}`;
  const regularId = randomUUID();
  const altId = randomUUID();
  const dinnerId = randomUUID();
  const regularRowId = randomUUID();
  const altRowId = randomUUID();

  let lockClient: pg.Client;
  let pool: pg.Pool;
  let client: PrismaClient;
  let scoped: PrismaClient;

  function inVenue<T>(work: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.venue_id', ${venueId}, true)`;
      return work(tx as unknown as PrismaClient);
    });
  }

  const read = () => runWithVenueContext(venueId, () => readStoredConfig(scoped, venueId));

  const week = (config: AvailabilityConfig) =>
    WEEK.map((date) =>
      resolveDay({ timezone: "UTC", config }, date).services.map((s) => [
        s.venueServiceId,
        s.opensAt,
        s.lastSeatingAt,
        s.closesAt,
      ])
    );

  const hours = (closesAt: number) => ({
    opensAt: 1020,
    lastSeatingAt: closesAt - 45,
    closesAt,
    seating: { version: 1, interval: 15 },
    bookingTypes: ["online", "phone"],
  });

  beforeAll(async () => {
    lockClient = new pg.Client({ connectionString: DATABASE_URL! });
    await lockClient.connect();
    await lockClient.query("SELECT pg_advisory_lock($1)", [RLS_SUITE_LOCK_KEY]);

    pool = new pg.Pool({ connectionString: DATABASE_URL! });
    client = new PrismaClient({ adapter: new PrismaPg(pool) });
    scoped = withVenueScopedQueries(client);

    await inVenue(async (tx) => {
      await tx.venue.create({
        data: { id: venueId, name: "Collapse IT", slug: venueId, ianaTimezone: "UTC" },
      });
      await tx.schedule.createMany({
        data: [
          { id: regularId, venueId, name: "Regular week", kind: "regular", isRegular: true },
          { id: altId, venueId, name: "Thu–Fri hours", kind: "alternate", isRegular: false },
        ],
      });
      await tx.venueService.create({ data: { id: dinnerId, venueId, name: "Dinner" } });
      await tx.scheduleService.createMany({
        data: [
          {
            id: regularRowId,
            venueId,
            scheduleId: regularId,
            venueServiceId: dinnerId,
            ...hours(1320),
          },
          { id: altRowId, venueId, scheduleId: altId, venueServiceId: dinnerId, ...hours(1380) },
        ],
      });
      await tx.scheduleAssignment.createMany({
        data: [
          { id: randomUUID(), venueId, scheduleId: regularId, weekdays: [1, 2, 3], precedence: 0 },
          { id: randomUUID(), venueId, scheduleId: altId, weekdays: [4, 5], precedence: 0 },
        ],
      });
    });
  });

  afterAll(async () => {
    await inVenue(async (tx) => {
      await tx.scheduleAssignment.deleteMany({ where: { venueId } });
      await tx.scheduleService.deleteMany({ where: { venueId } });
      await tx.schedule.deleteMany({ where: { venueId } });
      await tx.venueService.deleteMany({ where: { venueId } });
      await tx.venue.deleteMany({ where: { id: venueId } });
    });
    await client.$disconnect();
    await pool.end();
    await lockClient.query("SELECT pg_advisory_unlock($1)", [RLS_SUITE_LOCK_KEY]);
    await lockClient.end();
  });

  it("keeps every weekday's hours, archives the folded schedule and stays carried over", async () => {
    const before = await read();
    const carriedBefore = await getAvailabilityConfig(venueId, NOW, client);
    expect(carriedBefore).toMatchObject({ source: "rows", migrated: true, version: 0 });

    const dry = await collapseVenue(client, venueId, { apply: false, now: NOW });
    expect(dry.outcome).toBe("would_collapse");
    expect((await read()).config).toEqual(before.config);

    const applied = await collapseVenue(client, venueId, { apply: true, now: NOW });
    expect(applied.outcome).toBe("collapsed");

    const after = await read();
    expect(after.warnings).toEqual([]);
    expect(week(after.config)).toEqual(week(before.config));
    expect(after.config.schedules.find((s) => s.id === altId)?.archivedAt).toBe(NOW.toISOString());
    expect(after.config.assignments).toEqual([
      expect.objectContaining({ scheduleId: regularId, weekdays: [1, 2, 3, 4, 5] }),
    ]);
    expect(after.config.scheduleServices.filter((r) => r.scheduleId === regularId)).toEqual([
      expect.objectContaining({
        id: regularRowId,
        weekdays: [],
        dayHours: {
          version: 1,
          sets: [expect.objectContaining({ weekdays: [4, 5], closesAt: 1380 })],
        },
      }),
    ]);

    const carriedAfter = await getAvailabilityConfig(venueId, NOW, client);
    expect(carriedAfter).toMatchObject({ source: "rows", migrated: true, version: 1 });
    const changes = await inVenue((tx) => tx.availabilityChange.count({ where: { venueId } }));
    expect(changes).toBe(0);

    const again = await collapseVenue(client, venueId, { apply: true, now: NOW });
    expect(again.outcome).toBe("nothing_to_collapse");
  });
});
