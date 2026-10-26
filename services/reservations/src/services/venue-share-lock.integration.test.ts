import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/index.js";

/**
 * Real-Postgres proof for #7679 (finding R4): a booking and a closure save must serialise on the
 * venue row, and taking the locks in the closure command's order (venue row, then table advisory
 * lock) must not deadlock. Two or three real connections, interleaved by hand.
 *
 * The SQL here mirrors `venueShareLockSql` / `tableAdvisoryLockSql` in `book-slot.ts` and the
 * closure CAS in `closure-command.ts`. Skips when `DATABASE_URL` is unset; CI's `rls-integration`
 * job runs it, so it is not exercised locally.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const RLS_SUITE_LOCK_KEY = 5369;
const BLOCKED_TIMEOUT_MS = 5000;
const POLL_MS = 25;

const SHARE_LOCK = "SELECT 1 FROM venues WHERE id = $1 FOR SHARE";
const CAS = "UPDATE venues SET availability_version = availability_version + 1 WHERE id = $1";
const TABLE_LOCK = "SELECT pg_advisory_xact_lock(hashtext($1)::bigint)";

describe.skipIf(!DATABASE_URL)("venue share lock vs closure CAS (real Postgres)", () => {
  const venueId = `share-lock-it-${randomUUID()}`;
  const tableKey = `table-${randomUUID()}`;

  let lockClient: pg.Client;
  let pool: pg.Pool;
  let prisma: PrismaClient;
  let observer: pg.Client;
  let closure: pg.Client;
  let booking: pg.Client;

  async function connect(): Promise<pg.Client> {
    const c = new pg.Client({ connectionString: DATABASE_URL! });
    await c.connect();
    return c;
  }

  /** Opens a transaction scoped to the test venue (venues' RLS policy is keyed on app.venue_id). */
  async function begin(c: pg.Client): Promise<void> {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.venue_id', $1, true)", [venueId]);
  }

  async function pidOf(c: pg.Client): Promise<number> {
    const { rows } = await c.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    return rows[0]!.pid;
  }

  /** Resolves once `pid` is waiting on a heavyweight lock, i.e. is blocked by another transaction. */
  async function untilBlocked(pid: number): Promise<void> {
    const deadline = Date.now() + BLOCKED_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const { rows } = await observer.query(
        "SELECT 1 FROM pg_stat_activity WHERE pid = $1 AND wait_event_type = 'Lock'",
        [pid]
      );
      if (rows.length > 0) return;
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    throw new Error(`backend ${pid} never blocked on a lock`);
  }

  beforeAll(async () => {
    lockClient = await connect();
    await lockClient.query("SELECT pg_advisory_lock($1)", [RLS_SUITE_LOCK_KEY]);

    pool = new pg.Pool({ connectionString: DATABASE_URL! });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.venue_id', ${venueId}, true)`;
      await tx.venue.create({
        data: { id: venueId, name: "Share lock IT", slug: venueId, ianaTimezone: "UTC" },
      });
    });

    observer = await connect();
    closure = await connect();
    booking = await connect();
  });

  afterAll(async () => {
    for (const c of [closure, booking]) await c.query("ROLLBACK").catch(() => undefined);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.venue_id', ${venueId}, true)`;
      await tx.venue.deleteMany({ where: { id: venueId } });
    });
    await prisma.$disconnect();
    await pool.end();
    await Promise.all([observer.end(), closure.end(), booking.end()]);
    await lockClient.query("SELECT pg_advisory_unlock($1)", [RLS_SUITE_LOCK_KEY]);
    await lockClient.end();
  });

  it("makes the closure CAS wait for an in-flight booking to commit", async () => {
    await begin(booking);
    await booking.query(SHARE_LOCK, [venueId]);
    await begin(closure);
    const closurePid = await pidOf(closure);

    let casDone = false;
    const cas = closure.query(CAS, [venueId]).then(() => {
      casDone = true;
    });
    await untilBlocked(closurePid);
    expect(casDone).toBe(false);

    await booking.query("COMMIT");
    await cas;
    expect(casDone).toBe(true);
    await closure.query("COMMIT");
  });

  it("makes a booking wait for an in-flight closure, then lets both finish", async () => {
    await begin(closure);
    await closure.query(CAS, [venueId]);
    await begin(booking);
    const bookingPid = await pidOf(booking);

    let shareDone = false;
    const share = booking.query(SHARE_LOCK, [venueId]).then(() => {
      shareDone = true;
    });
    await untilBlocked(bookingPid);
    expect(shareDone).toBe(false);

    await closure.query("COMMIT");
    await share;
    await booking.query("COMMIT");
  });

  it("does not deadlock a booking and a closure that moves a booking on the same table", async () => {
    // Booking: venue row (share) -> table lock, as bookSlot does. Closure: venue row (CAS)
    // -> table lock, as applyTransitions -> targetTaken does. Same order, so no 40P01.
    await begin(closure);
    await closure.query(CAS, [venueId]);
    await begin(booking);
    const bookingPid = await pidOf(booking);

    const bookingWork = booking
      .query(SHARE_LOCK, [venueId])
      .then(() => booking.query(TABLE_LOCK, [tableKey]))
      .then(() => booking.query("COMMIT"));
    await untilBlocked(bookingPid);

    await closure.query(TABLE_LOCK, [tableKey]);
    await closure.query("COMMIT");
    await expect(bookingWork).resolves.toBeDefined();
  });
});
