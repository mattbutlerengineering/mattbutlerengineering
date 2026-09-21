import { describe, it, expect, vi, afterEach } from "vitest";
import { createLapsedGuestMonitor } from "./lapsed-guest-cron.js";
import type { LapsingGuest } from "@mbe/types";
import type { FastifyBaseLogger } from "fastify";

function makeLogger(): FastifyBaseLogger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
    level: "info",
    silent: vi.fn(),
  } as unknown as FastifyBaseLogger;
}

type MockTx = {
  /** `setVenueContext`'s `set_config` call, recorded per transaction. */
  executeRaw: ReturnType<typeof vi.fn>;
  /** The guest query, as invoked on THIS transaction's own client. */
  guestFindMany: ReturnType<typeof vi.fn>;
};

/**
 * Fake Prisma client mirroring `venue-scoped-prisma.test.ts`'s shape:
 * `$transaction` hands its callback a fresh `tx` whose `$executeRaw` and
 * `guest.findMany` are per-transaction spies, pushed onto `txs` in call
 * order. That is what lets these tests prove the transaction BOUNDARY —
 * `findGuestsForVenue` must issue `setVenueContext`'s `set_config` and the
 * guest query against the SAME `tx` (ADR-026 §4), because a `set_config(...,
 * true)` is transaction-scoped and evaporates outside it.
 *
 * `bareGuestFindMany` is the top-level, non-transacted `guest` delegate. It
 * must never be called: a guest query issued there would run outside the
 * transaction that set `app.venue_id` — precisely the ADR-026 part 6 bug
 * documented in `../middleware/venue-context.ts`.
 *
 * The venue-list read is asserted on `$queryRaw`, not on a model delegate:
 * it is not venue-scopable by construction, so it goes through ADR-026 §3's
 * `app_cross_venue_venues()` escape hatch (issue #5369) instead of
 * `prisma.venue.findMany`. `bareVenueFindMany` must never be called — a bare
 * delegate read is exactly the owner-bypass-dependent shape this replaced.
 */
function makePrisma(
  overrides: {
    queryRawVenueIds?: ReturnType<typeof vi.fn>;
    guestFindMany?: ReturnType<typeof vi.fn>;
  } = {}
) {
  const queryRawVenueIds =
    overrides.queryRawVenueIds ?? vi.fn().mockResolvedValue([{ id: "venue-1" }]);
  const bareVenueFindMany = vi.fn().mockResolvedValue([]);
  // Shared implementation behind every per-transaction guest spy: controls
  // what the scan reads, and records the query arguments once, regardless of
  // which venue's transaction issued it.
  const guestFindMany = overrides.guestFindMany ?? vi.fn().mockResolvedValue([]);
  // `ReturnType<typeof vi.fn>` is `Mock<Procedure | Constructable>`, which TS
  // won't let us invoke directly — narrow it once, here, to the call shape a
  // Prisma delegate method actually has.
  const callGuestFindMany = guestFindMany as unknown as (...args: unknown[]) => Promise<unknown>;
  const bareGuestFindMany = vi.fn().mockResolvedValue([]);
  const txs: MockTx[] = [];

  const $transaction = vi.fn(async (fn: (tx: unknown) => unknown) => {
    const executeRaw = vi.fn().mockResolvedValue(0);
    const txGuestFindMany = vi.fn((...args: unknown[]) => callGuestFindMany(...args));
    txs.push({ executeRaw, guestFindMany: txGuestFindMany });
    return fn({
      $executeRaw: executeRaw,
      guest: { findMany: txGuestFindMany },
    });
  });

  const client = {
    venue: { findMany: bareVenueFindMany },
    guest: { findMany: bareGuestFindMany },
    $queryRaw: queryRawVenueIds,
    $transaction,
  };

  return {
    client,
    $transaction,
    queryRawVenueIds,
    guestFindMany,
    bareVenueFindMany,
    bareGuestFindMany,
    txs,
  };
}

/** Long enough for the 0ms startup timer plus the scan's own microtasks. */
const SCAN_SETTLE_MS = 10;

/** Comfortably past a 50ms interval, to prove `stop()` cancelled it. */
const PAST_NEXT_INTERVAL_MS = 120;

/** Runs one full scan cycle against a monitor built from `prisma`. */
async function runOneScan(prisma: unknown): Promise<FastifyBaseLogger> {
  const monitor = createLapsedGuestMonitor({
    prisma: prisma as never,
    startupDelayMs: 0,
    intervalMs: 100,
  });
  const log = makeLogger();

  monitor.start(log);
  await new Promise((r) => setTimeout(r, SCAN_SETTLE_MS));
  monitor.stop();

  return log;
}

describe("createLapsedGuestMonitor (prisma interface)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("queries venues and guests using prisma client", async () => {
    const { client, queryRawVenueIds, guestFindMany } = makePrisma();

    await runOneScan(client);

    expect(queryRawVenueIds).toHaveBeenCalledTimes(1);
    expect(guestFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ venueId: "venue-1", visitCount: { gte: 3 } }),
      })
    );
  });

  it("sets app.venue_id via set_config on the SAME transaction as the guest query, before it runs (ADR-026 §4)", async () => {
    const { client, txs, bareGuestFindMany } = makePrisma();

    await runOneScan(client);

    // One transaction per venue — the venue-list read is not transacted.
    expect(txs).toHaveLength(1);
    const tx = txs[0];
    if (!tx) throw new Error("expected the venue scan to open a transaction");

    // The guest query ran on the transaction client, never on the bare
    // singleton — a bare call would run outside the transaction whose
    // `set_config` scoped it.
    expect(tx.guestFindMany).toHaveBeenCalledTimes(1);
    expect(bareGuestFindMany).not.toHaveBeenCalled();

    // `setVenueContext`'s parameterized `set_config` — the venue id arrives
    // as a bound value of the tagged template, never interpolated into SQL.
    expect(tx.executeRaw).toHaveBeenCalledTimes(1);
    const call = tx.executeRaw.mock.calls[0];
    if (!call) throw new Error("expected a set_config call on the transaction");
    const [strings, ...values] = call as [string[], ...unknown[]];
    expect(strings.join("")).toContain("set_config('app.venue_id'");
    expect(values).toEqual(["venue-1"]);

    // Ordering: `set_config` must be the transaction's FIRST statement, so
    // the guest query it scopes runs after it (same idiom as
    // `venue-scoped-prisma.test.ts`).
    const setConfigOrder = tx.executeRaw.mock.invocationCallOrder[0] ?? Infinity;
    const guestQueryOrder = tx.guestFindMany.mock.invocationCallOrder[0] ?? -Infinity;
    expect(setConfigOrder).toBeLessThan(guestQueryOrder);
  });

  it("scopes each venue to its OWN transaction, each carrying that venue's id", async () => {
    const { client, txs } = makePrisma({
      queryRawVenueIds: vi.fn().mockResolvedValue([{ id: "venue-1" }, { id: "venue-2" }]),
    });

    await runOneScan(client);

    // Two venues, two independent transactions — a single shared
    // transaction would make one venue's `set_config` overwrite the other's.
    expect(txs).toHaveLength(2);
    const venueIds = txs.map((tx) => tx.executeRaw.mock.calls[0]?.[1]);
    expect(venueIds).toEqual(expect.arrayContaining(["venue-1", "venue-2"]));

    // Each transaction issued exactly one guest query, after its own
    // `set_config`.
    for (const tx of txs) {
      expect(tx.executeRaw).toHaveBeenCalledTimes(1);
      expect(tx.guestFindMany).toHaveBeenCalledTimes(1);
      const setConfigOrder = tx.executeRaw.mock.invocationCallOrder[0] ?? Infinity;
      const guestQueryOrder = tx.guestFindMany.mock.invocationCallOrder[0] ?? -Infinity;
      expect(setConfigOrder).toBeLessThan(guestQueryOrder);
    }
  });

  it("reads the venue list through the cross-venue escape hatch, WITHOUT a transaction (ADR-026 §3)", async () => {
    const { client, queryRawVenueIds, bareVenueFindMany, $transaction } = makePrisma();

    await runOneScan(client);

    // `venues` is keyed on the row's own id, so there is no single venue id
    // to scope this read to — it goes through `app_cross_venue_venues()`
    // instead, as one statement whose own lifetime is the marker's lifetime
    // (issue #5369). A bare delegate read would be the owner-bypass shape.
    const [strings] = (queryRawVenueIds.mock.calls[0] ?? []) as [string[]];
    expect(strings?.join("")).toContain("app_cross_venue_venues()");
    expect(bareVenueFindMany).not.toHaveBeenCalled();
    expect(queryRawVenueIds).toHaveBeenCalledTimes(1);
    expect($transaction).toHaveBeenCalledTimes(1);
  });

  it("logs when lapsing guests are found via prisma", async () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);

    // Guest with visits that trigger lapse detection
    const lapsingGuest = {
      id: "g-1",
      name: "Jane",
      email: "jane@example.com",
      phone: null,
      communicationPreference: "both",
      reservations: [
        { startTime: daysAgo(35) },
        { startTime: daysAgo(28) },
        { startTime: daysAgo(21) },
      ],
    };

    const { client } = makePrisma({
      guestFindMany: vi.fn().mockResolvedValue([lapsingGuest]),
    });

    const log = await runOneScan(client);

    expect(log.info).toHaveBeenCalledWith(
      { venueId: "venue-1", count: 1 },
      "lapsed guest scan: found lapsing guests"
    );
  });

  it("logs error when prisma query throws", async () => {
    const err = new Error("db failure");
    const { client } = makePrisma({
      queryRawVenueIds: vi.fn().mockRejectedValue(err),
    });

    const log = await runOneScan(client);

    expect(log.error).toHaveBeenCalledWith({ err }, "lapsed guest scan: error");
  });

  it("stop() prevents further scans from running", async () => {
    const { client, queryRawVenueIds } = makePrisma();
    const monitor = createLapsedGuestMonitor({
      prisma: client as never,
      startupDelayMs: 0,
      intervalMs: 50,
    });
    const log = makeLogger();

    monitor.start(log);
    await new Promise((r) => setTimeout(r, SCAN_SETTLE_MS));
    monitor.stop();

    const callsAfterStop = queryRawVenueIds.mock.calls.length;
    await new Promise((r) => setTimeout(r, PAST_NEXT_INTERVAL_MS));
    expect(queryRawVenueIds.mock.calls.length).toBe(callsAfterStop);
  });

  it("guest query selects required fields and filters by COMPLETED reservations", async () => {
    const { client, guestFindMany } = makePrisma();

    await runOneScan(client);

    const call = guestFindMany.mock.calls[0]?.[0];
    if (!call) throw new Error("expected a guest.findMany call");
    expect(call.select).toMatchObject({
      id: true,
      name: true,
      email: true,
      phone: true,
      communicationPreference: true,
      reservations: expect.objectContaining({
        where: { status: "COMPLETED" },
        select: { startTime: true },
      }),
    });
  });
});

describe("createLapsedGuestMonitor — concurrent scanning", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scans all venues concurrently (Promise.allSettled — one failure does not abort others)", async () => {
    const order: string[] = [];

    const getVenueIds = vi.fn<() => Promise<string[]>>().mockResolvedValue(["v1", "v2", "v3"]);
    const runScan = vi
      .fn<(venueId: string) => Promise<LapsingGuest[]>>()
      .mockImplementation((venueId) => {
        if (venueId === "v2") {
          return Promise.reject(new Error("v2 db error"));
        }
        return new Promise((resolve) => {
          setTimeout(() => {
            order.push(venueId);
            resolve([]);
          }, 10);
        });
      });

    const log = makeLogger();
    const monitor = createLapsedGuestMonitor({
      getVenueIds,
      runScan,
      startupDelayMs: 0,
      intervalMs: 10000,
    });

    monitor.start(log);
    // Wait long enough for all concurrent scans to finish (all 10ms timers + buffer)
    await new Promise((r) => setTimeout(r, 50));
    monitor.stop();

    // All three scans were launched (v2 rejects, v1 and v3 succeed)
    expect(runScan).toHaveBeenCalledTimes(3);
    // v1 and v3 both completed despite v2 failing
    expect(order).toContain("v1");
    expect(order).toContain("v3");
    // v2's error was logged individually, not swallowed
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: "v2", err: expect.any(Error) }),
      "lapsed guest scan: venue error"
    );
    // The top-level scan did NOT error (allSettled absorbs individual failures)
    expect(log.error).not.toHaveBeenCalledWith(
      expect.objectContaining({}),
      "lapsed guest scan: error"
    );
  });

  it("logs per-venue error individually without aborting sibling scans", async () => {
    const getVenueIds = vi.fn<() => Promise<string[]>>().mockResolvedValue(["va", "vb"]);
    const runScan = vi
      .fn<(venueId: string) => Promise<LapsingGuest[]>>()
      .mockImplementation((venueId) => {
        if (venueId === "va") return Promise.reject(new Error("va failure"));
        return Promise.resolve([]);
      });

    const log = makeLogger();
    const monitor = createLapsedGuestMonitor({
      getVenueIds,
      runScan,
      startupDelayMs: 0,
      intervalMs: 10000,
    });

    monitor.start(log);
    await new Promise((r) => setTimeout(r, 20));
    monitor.stop();

    // vb was still scanned even though va failed
    expect(runScan).toHaveBeenCalledWith("vb");
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: "va" }),
      "lapsed guest scan: venue error"
    );
    // No top-level crash
    expect(log.error).not.toHaveBeenCalledWith(expect.anything(), "lapsed guest scan: error");
  });
});

// Retain legacy callback-based tests for the function signature (backwards-compat reference)
function makeDeps(overrides: Partial<Parameters<typeof createLapsedGuestMonitor>[0]> = {}) {
  return {
    getVenueIds: vi.fn<() => Promise<string[]>>().mockResolvedValue(["venue-1"]),
    runScan: vi.fn<(venueId: string) => Promise<LapsingGuest[]>>().mockResolvedValue([]),
    startupDelayMs: 0,
    intervalMs: 100,
    ...overrides,
  };
}

describe("createLapsedGuestMonitor (legacy callback interface)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls runScan for each venue after startup", async () => {
    const deps = makeDeps({ startupDelayMs: 0 });
    const log = makeLogger();
    const monitor = createLapsedGuestMonitor(deps);

    monitor.start(log);
    await new Promise((r) => setTimeout(r, 10));
    monitor.stop();

    expect(deps.getVenueIds).toHaveBeenCalledTimes(1);
    expect(deps.runScan).toHaveBeenCalledWith("venue-1");
  });

  it("logs when lapsing guests are found", async () => {
    const lapsingGuest = { guestId: "g-1" } as LapsingGuest;
    const deps = makeDeps({
      startupDelayMs: 0,
      runScan: vi.fn().mockResolvedValue([lapsingGuest]),
    });
    const log = makeLogger();
    const monitor = createLapsedGuestMonitor(deps);

    monitor.start(log);
    await new Promise((r) => setTimeout(r, 10));
    monitor.stop();

    expect(log.info).toHaveBeenCalledWith(
      { venueId: "venue-1", count: 1 },
      "lapsed guest scan: found lapsing guests"
    );
  });

  it("logs error when scan throws", async () => {
    const err = new Error("db failure");
    const deps = makeDeps({
      startupDelayMs: 0,
      getVenueIds: vi.fn().mockRejectedValue(err),
    });
    const log = makeLogger();
    const monitor = createLapsedGuestMonitor(deps);

    monitor.start(log);
    await new Promise((r) => setTimeout(r, 10));
    monitor.stop();

    expect(log.error).toHaveBeenCalledWith({ err }, "lapsed guest scan: error");
  });

  it("stop() prevents further scans from running", async () => {
    const runScan = vi.fn<(venueId: string) => Promise<LapsingGuest[]>>().mockResolvedValue([]);
    const deps = makeDeps({ startupDelayMs: 0, intervalMs: 50, runScan });
    const log = makeLogger();
    const monitor = createLapsedGuestMonitor(deps);

    monitor.start(log);
    await new Promise((r) => setTimeout(r, 10));
    monitor.stop();

    const callsAfterStop = runScan.mock.calls.length;
    await new Promise((r) => setTimeout(r, 120));
    expect(runScan.mock.calls.length).toBe(callsAfterStop);
  });
});
