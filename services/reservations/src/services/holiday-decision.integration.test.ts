import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/index.js";
import { setVenueContext } from "../middleware/venue-context.js";
import { runWithVenueContext } from "./venue-context-store.js";
import { holidayDecisionService } from "./holiday-decision.js";
import { venueService } from "./venue.js";

/**
 * Real-Postgres proof for the holiday-decision store (docs/features/availability-holidays-copy/
 * architecture.md § A): the upsert and delete are idempotent, one venue's rows are neither
 * visible nor writable under another venue's context (RLS), a row whose decision the reader
 * does not know is skipped, and deleting a venue removes its rows (the FK cascades).
 *
 * Skips when `DATABASE_URL` is unset; CI's `rls-integration` job runs it. Shares the
 * FORCE-toggling suites' advisory lock so it never sees their window.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const RLS_SUITE_LOCK_KEY = 5369;
const RANGE = { from: "2026-11-01", to: "2027-01-31" };

describe.skipIf(!DATABASE_URL)("holiday decisions (real Postgres)", () => {
  let lockClient: pg.Client;
  let pool: pg.Pool;
  let client: PrismaClient;

  function inVenue<T>(venueId: string, work: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return client.$transaction(async (tx) => {
      await setVenueContext(tx as never, venueId);
      return work(tx as unknown as PrismaClient);
    });
  }

  const makeVenue = async (): Promise<string> => {
    const venueId = `holiday-decision-it-${randomUUID()}`;
    await inVenue(venueId, (tx) =>
      tx.venue.create({ data: { id: venueId, name: "Venue", slug: venueId, ianaTimezone: "UTC" } })
    );
    return venueId;
  };

  const set = (venueId: string, serviceDate: string, actorId = "auth0|ana") =>
    holidayDecisionService.set(
      { venueId, serviceDate, decision: "open_as_usual", actorId },
      client as never
    );
  const list = (venueId: string) =>
    holidayDecisionService.list(venueId, RANGE, undefined, client as never);

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

  it("sets, lists by date inside the range only, and keeps the first row on a repeat", async () => {
    const venueId = await makeVenue();
    const first = await set(venueId, "2026-12-25", "auth0|first");
    await set(venueId, "2026-11-26");
    await set(venueId, "2027-07-04"); // outside the range

    const again = await set(venueId, "2026-12-25", "auth0|second");

    expect(again).toEqual(first);
    const rows = await list(venueId);
    expect(rows?.map((r) => r.serviceDate)).toEqual(["2026-11-26", "2026-12-25"]);
    const stored = await inVenue(venueId, (tx) =>
      tx.venueHolidayDecision.findMany({ where: { venueId, serviceDate: new Date("2026-12-25") } })
    );
    expect(stored).toHaveLength(1);
    expect(stored[0]?.createdByUserId).toBe("auth0|first");

    await runWithVenueContext(venueId, () => venueService.delete(venueId));
  });

  it("clears a decision, and clearing a date with none still succeeds", async () => {
    const venueId = await makeVenue();
    await set(venueId, "2026-11-26");

    expect(await holidayDecisionService.clear(venueId, "2026-11-26", client as never)).toBe(true);
    expect(await holidayDecisionService.clear(venueId, "2026-11-26", client as never)).toBe(true);

    expect(await list(venueId)).toEqual([]);
    await runWithVenueContext(venueId, () => venueService.delete(venueId));
  });

  it("returns null and false for a venue that does not exist", async () => {
    expect(await list("holiday-decision-it-missing")).toBeNull();
    expect(await set("holiday-decision-it-missing", "2026-11-26")).toBeNull();
    expect(
      await holidayDecisionService.clear(
        "holiday-decision-it-missing",
        "2026-11-26",
        client as never
      )
    ).toBe(false);
  });

  it("does not show or clear another venue's rows (RLS)", async () => {
    const a = await makeVenue();
    const b = await makeVenue();
    await set(b, "2026-11-26");

    expect(await list(a)).toEqual([]);
    await holidayDecisionService.clear(a, "2026-11-26", client as never);
    expect((await list(b))?.map((r) => r.serviceDate)).toEqual(["2026-11-26"]);

    // The database itself refuses a write for another venue under this venue's context.
    await expect(
      inVenue(a, (tx) =>
        tx.venueHolidayDecision.create({
          data: { venueId: b, serviceDate: new Date("2026-12-25"), decision: "open_as_usual" },
        })
      )
    ).rejects.toThrow();

    await runWithVenueContext(a, () => venueService.delete(a));
    await runWithVenueContext(b, () => venueService.delete(b));
  });

  it("skips a row whose decision it does not know, without failing the list", async () => {
    const venueId = await makeVenue();
    await set(venueId, "2026-11-26");
    await inVenue(venueId, (tx) =>
      tx.venueHolidayDecision.create({
        data: { venueId, serviceDate: new Date("2026-12-25"), decision: "something_new" },
      })
    );
    const warnings: object[] = [];

    const rows = await holidayDecisionService.list(
      venueId,
      RANGE,
      { warn: (obj) => warnings.push(obj) },
      client as never
    );

    expect(rows?.map((r) => r.serviceDate)).toEqual(["2026-11-26"]);
    expect(warnings).toHaveLength(1);
    await runWithVenueContext(venueId, () => venueService.delete(venueId));
  });

  it("removes a venue's decisions when the venue is deleted (FK cascade)", async () => {
    const venueId = await makeVenue();
    await set(venueId, "2026-11-26");

    expect(await runWithVenueContext(venueId, () => venueService.delete(venueId))).toBe("deleted");

    const left = await inVenue(venueId, (tx) =>
      tx.venueHolidayDecision.count({ where: { venueId } })
    );
    expect(left).toBe(0);
  });
});
