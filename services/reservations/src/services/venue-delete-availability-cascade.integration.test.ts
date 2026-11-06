import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/index.js";
import { venueService } from "./venue.js";
import { setVenueContext } from "../middleware/venue-context.js";
import { runWithVenueContext } from "./venue-context-store.js";

/**
 * Real-Postgres proof for #8333: the daily synthetic venue-onboarding journey
 * fails its own cleanup delete with a 409, every time, because onboarding's
 * "hours" stage (`runHoursStage` in launch-sequence.ts) always saves the
 * wizard's quick-setup hours as the venue's regular week — which writes a
 * `Schedule`, `VenueService`, `ScheduleService`, `ScheduleAssignment` and an
 * `AvailabilityChange` audit row. Those five tables' `venue_id` foreign keys
 * were `ON DELETE RESTRICT` (unedited `prisma migrate diff` output from
 * #7500), so every venue that ever completes onboarding — not just the
 * synthetic one — became permanently undeletable via `DELETE
 * /api/v1/venues/:id`, independent of guest-facing data (no table, guest or
 * reservation involved here at all).
 *
 * A mocked Prisma client (as in venue.test.ts) never enforces real foreign
 * keys, so only a real database shows the delete actually failing before the
 * cascade migration and succeeding after it.
 *
 * Skips when `DATABASE_URL` is unset; CI's `rls-integration` job runs it.
 * Shares the FORCE-toggling suites' advisory lock so it never sees their window.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const RLS_SUITE_LOCK_KEY = 5369;

describe.skipIf(!DATABASE_URL)("venue delete vs. availability config rows (real Postgres)", () => {
  let lockClient: pg.Client;
  let pool: pg.Pool;
  let client: PrismaClient;

  function inVenue<T>(venueId: string, work: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return client.$transaction(async (tx) => {
      await setVenueContext(tx as never, venueId);
      return work(tx as unknown as PrismaClient);
    });
  }

  beforeAll(async () => {
    lockClient = new pg.Client({ connectionString: DATABASE_URL! });
    await lockClient.connect();
    await lockClient.query("SELECT pg_advisory_lock($1)", [RLS_SUITE_LOCK_KEY]);

    pool = new pg.Pool({ connectionString: DATABASE_URL! });
    client = new PrismaClient({ adapter: new PrismaPg(pool) });
  });

  afterAll(async () => {
    await client.$disconnect();
    await pool.end();
    await lockClient.query("SELECT pg_advisory_unlock($1)", [RLS_SUITE_LOCK_KEY]);
    await lockClient.end();
  });

  it("deletes a freshly-onboarded venue whose only dependents are its own hours config (#8333)", async () => {
    const venueId = `venue-delete-cascade-it-${randomUUID()}`;

    await inVenue(venueId, (tx) =>
      tx.venue.create({
        data: { id: venueId, name: "Onboarded venue", slug: venueId, ianaTimezone: "UTC" },
      })
    );

    // Exactly what `runHoursStage` leaves behind for a "Dinner, Weekdays"
    // quick-setup save — one row in each of the five config/audit tables.
    const scheduleId = randomUUID();
    const venueServiceId = randomUUID();
    await inVenue(venueId, async (tx) => {
      await tx.schedule.create({
        data: { id: scheduleId, venueId, name: "Regular week", kind: "regular", isRegular: true },
      });
      await tx.venueService.create({
        data: { id: venueServiceId, venueId, name: "Dinner" },
      });
      await tx.scheduleService.create({
        data: {
          venueId,
          scheduleId,
          venueServiceId,
          opensAt: 17 * 60,
          lastSeatingAt: 21 * 60,
          closesAt: 22 * 60,
          seating: { version: 1, interval: 15 },
          weekdays: [1, 2, 3, 4, 5],
        },
      });
      await tx.scheduleAssignment.create({
        data: { venueId, scheduleId, weekdays: [1, 2, 3, 4, 5] },
      });
      await tx.availabilityChange.create({
        data: {
          venueId,
          actorId: "test-actor",
          kind: "hours",
          summary: "Set the regular week",
          inverse: {},
        },
      });
    });

    const outcome = await runWithVenueContext(venueId, () => venueService.delete(venueId));
    expect(outcome).toBe("deleted");

    const left = await inVenue(venueId, async (tx) => ({
      venue: await tx.venue.findUnique({ where: { id: venueId } }),
      schedules: await tx.schedule.count({ where: { venueId } }),
      venueServices: await tx.venueService.count({ where: { venueId } }),
      scheduleServices: await tx.scheduleService.count({ where: { venueId } }),
      scheduleAssignments: await tx.scheduleAssignment.count({ where: { venueId } }),
      availabilityChanges: await tx.availabilityChange.count({ where: { venueId } }),
    }));
    expect(left).toEqual({
      venue: null,
      schedules: 0,
      venueServices: 0,
      scheduleServices: 0,
      scheduleAssignments: 0,
      availabilityChanges: 0,
    });
  });
});
