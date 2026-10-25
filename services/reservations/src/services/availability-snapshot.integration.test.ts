import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/index.js";
import { loadAvailabilitySnapshot } from "./availability-snapshot.js";
import { runWithVenueContext } from "./venue-context-store.js";
import { withVenueScopedQueries } from "./venue-scoped-prisma.js";

/**
 * Real-Postgres proof for the availability snapshot loader (#7501): the number
 * of statements it issues does not grow with the range, and the rows it reads
 * through the venue-scoped client (RLS, FORCE) come back parsed.
 *
 * Skips when `DATABASE_URL` is unset; CI's `rls-integration` job runs it.
 * Shares the FORCE-toggling suites' advisory lock so it never sees their window.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const RLS_SUITE_LOCK_KEY = 5369;

describe.skipIf(!DATABASE_URL)("loadAvailabilitySnapshot (real Postgres)", () => {
  const venueId = `snap-it-${randomUUID()}`;
  const now = new Date("2026-11-01T12:00:00Z");

  let lockClient: pg.Client;
  let pool: pg.Pool;
  let client: PrismaClient;
  let scoped: PrismaClient;
  let queryCount = 0;

  /** Runs `work` with the venue's RLS context set, as a write transaction. */
  function seed<T>(work: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.venue_id', ${venueId}, true)`;
      return work(tx as unknown as PrismaClient);
    });
  }

  beforeAll(async () => {
    lockClient = new pg.Client({ connectionString: DATABASE_URL! });
    await lockClient.connect();
    await lockClient.query("SELECT pg_advisory_lock($1)", [RLS_SUITE_LOCK_KEY]);

    pool = new pg.Pool({ connectionString: DATABASE_URL! });
    const logged = new PrismaClient({
      adapter: new PrismaPg(pool),
      log: [{ emit: "event", level: "query" }],
    });
    logged.$on("query", () => {
      queryCount += 1;
    });
    client = logged as unknown as PrismaClient;
    scoped = withVenueScopedQueries(client);

    await seed(async (tx) => {
      await tx.venue.create({
        data: { id: venueId, name: "Snapshot IT", slug: venueId, ianaTimezone: "UTC" },
      });
      const table = await tx.table.create({
        data: { venueId, name: "T1", capacity: 4, minCovers: 1 },
      });
      const schedule = await tx.schedule.create({
        data: { venueId, name: "Regular", kind: "regular", isRegular: true },
      });
      const service = await tx.venueService.create({ data: { venueId, name: "Dinner" } });
      await tx.scheduleService.create({
        data: {
          venueId,
          scheduleId: schedule.id,
          venueServiceId: service.id,
          opensAt: 1020,
          lastSeatingAt: 1260,
          closesAt: 1320,
          seating: { version: 1, interval: 15 },
          bookingTypes: ["online", "phone"],
        },
      });
      await tx.scheduleAssignment.create({
        data: { venueId, scheduleId: schedule.id, weekdays: [0, 1, 2, 3, 4, 5, 6] },
      });
      await tx.dateRule.create({
        data: {
          venueId,
          kind: "closure",
          targetKind: "tables",
          startsOn: new Date("2026-11-10"),
          endsOn: new Date("2026-11-12"),
          createdBy: "snapshot-it",
          tables: { create: [{ tableId: table.id, venueId }] },
        },
      });
      await tx.reservation.create({
        data: {
          venueId,
          tableId: table.id,
          date: new Date("2026-11-05"),
          startTime: new Date("2026-11-05T18:00:00Z"),
          endTime: new Date("2026-11-05T19:30:00Z"),
          partySize: 2,
        },
      });
    });
  });

  afterAll(async () => {
    await seed(async (tx) => {
      await tx.reservation.deleteMany({ where: { venueId } });
      await tx.dateRule.deleteMany({ where: { venueId } });
      await tx.scheduleAssignment.deleteMany({ where: { venueId } });
      await tx.scheduleService.deleteMany({ where: { venueId } });
      await tx.schedule.deleteMany({ where: { venueId } });
      await tx.venueService.deleteMany({ where: { venueId } });
      await tx.table.deleteMany({ where: { venueId } });
      await tx.venue.deleteMany({ where: { id: venueId } });
    });
    await client.$disconnect();
    await pool.end();
    await lockClient.query("SELECT pg_advisory_unlock($1)", [RLS_SUITE_LOCK_KEY]);
    await lockClient.end();
  });

  async function load(from: string, to: string) {
    queryCount = 0;
    const loaded = await runWithVenueContext(venueId, () =>
      loadAvailabilitySnapshot(venueId, from, to, now, { db: scoped })
    );
    return { loaded, queries: queryCount };
  }

  it("issues the same number of statements for a 1-day and a 30-day range", async () => {
    const day = await load("2026-11-05", "2026-11-05");
    const month = await load("2026-11-05", "2026-12-04");
    expect(day.queries).toBeGreaterThan(0);
    expect(month.queries).toBe(day.queries);
  });

  it("reads and parses the seeded rows through RLS", async () => {
    const { loaded } = await load("2026-11-05", "2026-11-12");
    expect(loaded.warnings).toEqual([]);
    expect(loaded.snapshot.config.schedules).toHaveLength(1);
    expect(loaded.snapshot.config.scheduleServices).toHaveLength(1);
    expect(loaded.snapshot.config.dateRules).toEqual([
      expect.objectContaining({ kind: "closure", targetKind: "tables" }),
    ]);
    expect(loaded.snapshot.config.dateRules[0]?.tableIds).toHaveLength(1);
    expect(loaded.snapshot.tables).toHaveLength(1);
    expect(loaded.snapshot.reservations).toHaveLength(1);
  });
});
