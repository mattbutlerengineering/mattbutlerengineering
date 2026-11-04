import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import type { ScheduleService } from "@mbe/types";
import { PrismaClient } from "../generated/prisma/index.js";
import type { ConfigDiff } from "./availability-config-plan.js";
import { readStoredConfig, writeConfigDiff } from "./availability-config-rows.js";
import { runWithVenueContext } from "./venue-context-store.js";
import { withVenueScopedQueries } from "./venue-scoped-prisma.js";

/**
 * Forward-path proof for add_schedule_service_day_scope (ADR-031) on a real
 * Postgres: a row written before the migration (the two columns omitted, so
 * the column defaults fill them) reads as "no scope", and a varied week
 * written through the config store reads back byte-equal.
 *
 * Skips when `DATABASE_URL` is unset; run it against a freshly migrated
 * Docker Postgres. Shares the FORCE-toggling suites' advisory lock.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const RLS_SUITE_LOCK_KEY = 5369;

describe.skipIf(!DATABASE_URL)("schedule service day scope (real Postgres)", () => {
  const venueId = `day-scope-it-${randomUUID()}`;
  const oldShapeId = randomUUID();
  const scheduleId = randomUUID();
  const serviceId = randomUUID();

  let lockClient: pg.Client;
  let pool: pg.Pool;
  let client: PrismaClient;
  let scoped: PrismaClient;

  /** Runs `work` in a write transaction with the venue's RLS context set. */
  function inVenue<T>(work: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.venue_id', ${venueId}, true)`;
      return work(tx as unknown as PrismaClient);
    });
  }

  const read = () => runWithVenueContext(venueId, () => readStoredConfig(scoped, venueId));

  beforeAll(async () => {
    lockClient = new pg.Client({ connectionString: DATABASE_URL! });
    await lockClient.connect();
    await lockClient.query("SELECT pg_advisory_lock($1)", [RLS_SUITE_LOCK_KEY]);

    pool = new pg.Pool({ connectionString: DATABASE_URL! });
    client = new PrismaClient({ adapter: new PrismaPg(pool) });
    scoped = withVenueScopedQueries(client);

    await inVenue(async (tx) => {
      await tx.venue.create({
        data: { id: venueId, name: "Day Scope IT", slug: venueId, ianaTimezone: "UTC" },
      });
      await tx.schedule.create({
        data: { id: scheduleId, venueId, name: "Regular", kind: "regular", isRegular: true },
      });
      await tx.venueService.create({ data: { id: serviceId, venueId, name: "Dinner" } });
      // The old shape: `weekdays` and `day_hours` omitted, so the defaults apply.
      await tx.scheduleService.create({
        data: {
          id: oldShapeId,
          venueId,
          scheduleId,
          venueServiceId: serviceId,
          opensAt: 1020,
          lastSeatingAt: 1260,
          closesAt: 1320,
          seating: { version: 1, interval: 15 },
          bookingTypes: ["online", "phone"],
        },
      });
    });
  });

  afterAll(async () => {
    await inVenue(async (tx) => {
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

  it("reads a row inserted without the two columns as no scope", async () => {
    const { config, warnings } = await read();
    expect(warnings).toEqual([]);
    expect(config.scheduleServices).toEqual([
      expect.objectContaining({
        id: oldShapeId,
        weekdays: [],
        dayHours: { version: 1, sets: [] },
      }),
    ]);
  });

  it("writes a varied week through the store and reads it back byte-equal", async () => {
    const brunchId = randomUUID();
    const brunchScheduleId = randomUUID();
    const brunchRow: ScheduleService = {
      id: randomUUID(),
      scheduleId: brunchScheduleId,
      venueServiceId: brunchId,
      opensAt: 660,
      lastSeatingAt: 840,
      closesAt: 900,
      seating: { version: 1, interval: 30 },
      bookingTypes: ["online"],
      weekdays: [1, 2, 3, 4, 5],
      dayHours: {
        version: 1,
        sets: [
          {
            weekdays: [4, 5],
            opensAt: 660,
            lastSeatingAt: 900,
            closesAt: 960,
            seating: { version: 1, interval: 15 },
            bookingTypes: ["online", "phone"],
          },
        ],
      },
    };
    const diff: ConfigDiff = {
      create: {
        schedules: [
          {
            id: brunchScheduleId,
            name: "Varied week",
            kind: "alternate",
            isRegular: false,
            archivedAt: null,
          },
        ],
        venueServices: [{ id: brunchId, name: "Brunch", position: 1, archivedAt: null }],
        scheduleServices: [brunchRow],
        assignments: [],
        dateRules: [],
      },
      update: {
        schedules: [],
        venueServices: [],
        scheduleServices: [],
        assignments: [],
        dateRules: [],
      },
      remove: {
        schedules: [],
        venueServices: [],
        scheduleServices: [],
        assignments: [],
        dateRules: [],
      },
    };
    await inVenue((tx) =>
      writeConfigDiff(tx, venueId, diff, { actorId: "day-scope-it", now: new Date() })
    );

    const { config, warnings } = await read();
    expect(warnings).toEqual([]);
    const back = config.scheduleServices.find((r) => r.id === brunchRow.id);
    expect(back).toEqual(brunchRow);
    expect(JSON.stringify(back?.dayHours)).toBe(JSON.stringify(brunchRow.dayHours));

    // The table is FORCE row-level secured, so the raw read sets the venue context like the store.
    const conn = await pool.connect();
    try {
      await conn.query("BEGIN");
      await conn.query("SELECT set_config('app.venue_id', $1, true)", [venueId]);
      const raw = await conn.query<{ weekdays: number[]; day_hours: unknown }>(
        "SELECT weekdays, day_hours FROM schedule_services WHERE id = $1",
        [brunchRow.id]
      );
      await conn.query("COMMIT");
      expect(raw.rows[0]).toEqual({ weekdays: brunchRow.weekdays, day_hours: brunchRow.dayHours });
    } finally {
      conn.release();
    }
  });
});
