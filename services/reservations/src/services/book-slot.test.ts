/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      venue: { findUnique: vi.fn() },
      reservation: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
      reservationHold: { findFirst: vi.fn(), findMany: vi.fn() },
      $transaction: vi.fn(),
    },
  });
});

vi.mock("./assert-bookable.js", () => ({
  judgeBooking: vi.fn().mockResolvedValue({ kind: "ok" }),
}));

import { bookSlot, tableAdvisoryLockSql } from "./book-slot.js";
import { prisma } from "./database.js";
import { judgeBooking } from "./assert-bookable.js";
import {
  overlapWindow,
  activeHoldWindow,
  serviceDayConflictWindow,
  NOT_BOOKED_STATUSES,
} from "./slot-rules.js";

const DATE = new Date("2026-05-05");
const START = new Date("2026-05-05T18:00:00Z");
const END = new Date("2026-05-05T19:30:00Z");

/** Builds a partial transaction-client mock with all methods bookSlot may call. */
function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $executeRaw: vi.fn().mockResolvedValue(0),
    venue: { findUnique: vi.fn().mockResolvedValue({ settings: null }) },
    reservation: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "res-1" }),
    },
    reservationHold: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
}

/** Wires prisma.$transaction to invoke the callback with the given tx mock once. */
function useTxOnce(tx: unknown): void {
  vi.mocked(prisma.$transaction).mockImplementationOnce(((
    fn: (client: unknown) => Promise<unknown>
  ) => fn(tx)) as never);
}

function baseIntent(overrides: Record<string, unknown> = {}) {
  return {
    tableId: "table-1",
    venueId: "venue-1",
    date: DATE,
    window: { startTime: START, endTime: END },
    partySize: 2,
    write: vi.fn().mockResolvedValue("WRITTEN"),
    ...overrides,
  };
}

/** A `$executeRaw` argument as text: a `Prisma.Sql`, or the strings of a tagged template. */
function sqlOf(arg: unknown): { sql: string; values: unknown[] } {
  if (Array.isArray(arg)) return { sql: arg.join("?"), values: [] };
  return arg as { sql: string; values: unknown[] };
}

describe("bookSlot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(judgeBooking).mockResolvedValue({ kind: "ok" });
  });

  it("acquires the table advisory lock, then runs write when the slot is free", async () => {
    const tx = makeTx();
    useTxOnce(tx);
    const intent = baseIntent();

    const result = await bookSlot(intent);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("WRITTEN");
    // Two $executeRaw calls on the transaction: setVenueContext's
    // set_config (ADR-026 part 6) first, then the table-keyed advisory lock.
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    const sql = vi.mocked(tx.$executeRaw).mock.calls[1]?.[0] as
      { sql: string; values: unknown[] } | undefined;
    if (!sql) throw new Error("expected a second $executeRaw call");
    expect(sql.sql).toContain("pg_advisory_xact_lock");
    expect(sql.values).toContain("table-1");
    expect(intent.write).toHaveBeenCalledTimes(1);
  });

  it("acquires the lock BEFORE the conflict check", async () => {
    const order: string[] = [];
    const tx = makeTx({
      $executeRaw: vi.fn().mockImplementation(() => {
        order.push("lock");
        return Promise.resolve(0);
      }),
      reservation: {
        findFirst: vi.fn().mockImplementation(() => {
          order.push("reservation.findFirst");
          return Promise.resolve(null);
        }),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: "res-1" }),
      },
    });
    useTxOnce(tx);

    await bookSlot(baseIntent());

    expect(order[0]).toBe("lock");
    expect(order.indexOf("lock")).toBeLessThan(order.indexOf("reservation.findFirst"));
  });

  it("returns a CONFLICT reason and skips write when a conflicting reservation exists", async () => {
    const tx = makeTx({
      reservation: {
        findFirst: vi.fn().mockResolvedValue({ id: "other" }),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
      },
    });
    useTxOnce(tx);
    const intent = baseIntent();

    const result = await bookSlot(intent);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflict.code).toBe("CONFLICT");
    expect(intent.write).not.toHaveBeenCalled();
  });

  it("re-checks conflicting holds when checkHoldConflict is set", async () => {
    const tx = makeTx({
      reservationHold: {
        findFirst: vi.fn().mockResolvedValue({ id: "hold-x" }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    });
    useTxOnce(tx);
    const intent = baseIntent({ checkHoldConflict: true });

    const result = await bookSlot(intent);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflict.code).toBe("CONFLICT");
    expect(intent.write).not.toHaveBeenCalled();
  });

  it("drift test: reservation conflict re-check derives its where-clause from the shared overlapWindow + NOT_BOOKED_STATUSES declaration", async () => {
    const tx = makeTx();
    useTxOnce(tx);

    await bookSlot(baseIntent());

    const reservationFindFirstCall = vi.mocked(tx.reservation.findFirst).mock.calls[0]?.[0] as
      { where: { startTime: unknown; endTime: unknown; status: unknown } } | undefined;
    if (!reservationFindFirstCall) throw new Error("expected a reservation.findFirst call");
    const { where } = reservationFindFirstCall;
    // Not hardcoded expected values — read live from slot-rules.js, so a
    // future change to the declaration (or a regression back to a
    // hand-rolled literal in bookSlot) is caught here.
    const expectedWindow = overlapWindow(START, END);
    expect(where.startTime).toEqual(expectedWindow.startTime);
    expect(where.endTime).toEqual(expectedWindow.endTime);
    expect(where.status).toEqual({ notIn: [...NOT_BOOKED_STATUSES] });
  });

  it("drift test: hold conflict re-check derives its where-clause from the shared overlapWindow + activeHoldWindow declaration", async () => {
    const now = new Date("2026-05-05T17:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const tx = makeTx();
      useTxOnce(tx);

      await bookSlot(baseIntent({ checkHoldConflict: true }));

      const holdFindFirstCall = vi.mocked(tx.reservationHold.findFirst).mock.calls[0]?.[0] as
        { where: { startTime: unknown; endTime: unknown; expiresAt: unknown } } | undefined;
      if (!holdFindFirstCall) throw new Error("expected a reservationHold.findFirst call");
      const { where } = holdFindFirstCall;
      const expectedWindow = overlapWindow(START, END);
      expect(where.startTime).toEqual(expectedWindow.startTime);
      expect(where.endTime).toEqual(expectedWindow.endTime);
      expect(where.expiresAt).toEqual(activeHoldWindow(now));
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads service days D-1 through D+1 in every conflict query", async () => {
    const tx = makeTx();
    useTxOnce(tx);

    await bookSlot(baseIntent({ checkHoldConflict: true }));

    const window = serviceDayConflictWindow(DATE);
    expect(window).toEqual({ gte: new Date("2026-05-04"), lte: new Date("2026-05-06") });
    const dates = [tx.reservation.findFirst, tx.reservationHold.findFirst].map(
      (fn) => (vi.mocked(fn).mock.calls[0]?.[0] as { where: { date: unknown } }).where.date
    );
    expect(dates).toEqual([window, window]);
  });

  it("leaves pacing to the availability gate: no pacing queries, a gate refusal is NOT_BOOKABLE", async () => {
    const rejection = { kind: "soft-limit", limits: ["pacing"] } as never;
    vi.mocked(judgeBooking).mockResolvedValueOnce({ kind: "rejected", rejection } as never);
    const tx = makeTx();
    useTxOnce(tx);
    const intent = baseIntent({ gate: { channel: "online" } });

    const result = await bookSlot(intent);

    expect(tx.reservation.findMany).not.toHaveBeenCalled();
    expect(tx.reservationHold.findMany).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflict.code).toBe("NOT_BOOKABLE");
    expect(intent.write).not.toHaveBeenCalled();
  });

  it("short-circuits on a caller guard and runs onUnbookable", async () => {
    const tx = makeTx();
    useTxOnce(tx);
    const onUnbookable = vi.fn().mockResolvedValue(undefined);
    const intent = baseIntent({
      guard: vi.fn().mockResolvedValue({ code: "EXPIRED", message: "gone" }),
      onUnbookable,
    });

    const result = await bookSlot(intent);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflict.code).toBe("EXPIRED");
    expect(onUnbookable).toHaveBeenCalledTimes(1);
    expect(intent.write).not.toHaveBeenCalled();
  });

  it("never runs the availability gate unless the intent asks for it", async () => {
    useTxOnce(makeTx());
    await bookSlot(baseIntent());
    expect(judgeBooking).not.toHaveBeenCalled();
  });

  it("runs the availability gate on the transaction client with the slot and exclusions", async () => {
    const tx = makeTx();
    useTxOnce(tx);
    const intent = baseIntent({
      gate: { channel: "phone" },
      excludeReservationId: "res-9",
      excludeHoldId: "hold-9",
      excludeSessionId: "sess-9",
    });

    const result = await bookSlot(intent);

    expect(result.ok).toBe(true);
    expect(judgeBooking).toHaveBeenCalledWith(tx, {
      venueId: "venue-1",
      tableId: "table-1",
      start: START,
      serviceDate: "2026-05-05",
      end: END,
      partySize: 2,
      channel: "phone",
      excludeReservationId: "res-9",
      excludeHoldId: "hold-9",
      excludeSessionId: "sess-9",
    });
  });

  it("share-locks the venue row first, then the table lock, then the gate reads config", async () => {
    // A closure commit CASes the venue row; sharing it makes an in-flight booking and the
    // closure serialise, so a booking cannot land under a closure it never saw (#7679).
    const tx = makeTx();
    useTxOnce(tx);

    await bookSlot(baseIntent({ gate: { channel: "phone" } }));

    const statements = vi.mocked(tx.$executeRaw).mock.calls.map((call) => sqlOf(call[0]));
    const tableLock = statements.findIndex((s) => s.sql.includes("pg_advisory_xact_lock"));
    const venueLock = statements.findIndex((s) => s.sql.includes("FOR SHARE"));
    expect(venueLock).toBeGreaterThanOrEqual(0);
    expect(venueLock).toBeLessThan(tableLock);
    expect(statements[venueLock]?.sql).toContain("venues");
    expect(statements[venueLock]?.values).toContain("venue-1");
    const lockOrder = vi.mocked(tx.$executeRaw).mock.invocationCallOrder[venueLock] ?? 0;
    const tableOrder = vi.mocked(tx.$executeRaw).mock.invocationCallOrder[tableLock] ?? 0;
    expect(lockOrder).toBeLessThan(tableOrder);
    expect(tableOrder).toBeLessThan(vi.mocked(judgeBooking).mock.invocationCallOrder[0] ?? 0);
  });

  it("does not share-lock the venue row when the intent skips the gate", async () => {
    const tx = makeTx();
    useTxOnce(tx);
    await bookSlot(baseIntent());
    const statements = vi.mocked(tx.$executeRaw).mock.calls.map((c) => sqlOf(c[0]));
    expect(statements.some((s) => s.sql.includes("FOR SHARE"))).toBe(false);
  });

  it("refuses a slot the gate rejects as NOT_BOOKABLE, runs onUnbookable, skips write", async () => {
    const rejection = { code: "outside-availability", reason: "closed" } as const;
    vi.mocked(judgeBooking).mockResolvedValueOnce({ kind: "rejected", rejection });
    useTxOnce(makeTx());
    const onUnbookable = vi.fn().mockResolvedValue(undefined);
    const intent = baseIntent({ gate: { channel: "online" }, onUnbookable });

    const result = await bookSlot(intent);

    expect(result).toEqual({
      ok: false,
      conflict: { code: "NOT_BOOKABLE", message: expect.any(String), rejection },
    });
    expect(onUnbookable).toHaveBeenCalledTimes(1);
    expect(intent.write).not.toHaveBeenCalled();
  });

  it("passes the staff override to the gate and hands the overridden limits to write", async () => {
    vi.mocked(judgeBooking).mockResolvedValueOnce({ kind: "ok", overrideLimits: ["pacing"] });
    useTxOnce(makeTx());
    const intent = baseIntent({ gate: { channel: "phone", override: { reason: "VIP" } } });

    const result = await bookSlot(intent);

    expect(result.ok).toBe(true);
    expect(judgeBooking).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ override: { reason: "VIP" } })
    );
    expect(intent.write).toHaveBeenCalledWith(expect.anything(), { overrideLimits: ["pacing"] });
  });

  it("reports a gate conflict as CONFLICT", async () => {
    vi.mocked(judgeBooking).mockResolvedValueOnce({ kind: "conflict" });
    useTxOnce(makeTx());
    const intent = baseIntent({ gate: { channel: "online" } });

    const result = await bookSlot(intent);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflict.code).toBe("CONFLICT");
    expect(intent.write).not.toHaveBeenCalled();
  });

  it("exposes tableAdvisoryLockSql binding the table id as a parameter", () => {
    const sql = tableAdvisoryLockSql("table-42");
    expect(sql.sql).toContain("pg_advisory_xact_lock");
    expect(sql.values).toContain("table-42");
  });

  it("serializes concurrent writes to the same slot: exactly one wins", async () => {
    // The advisory lock serializes conflict-checked writes per table. Model that
    // here by running $transaction callbacks one-at-a-time against a shared store;
    // the second call's in-tx conflict re-check must see the first's row and fail.
    const store: Array<{ tableId: string; startTime: Date; endTime: Date }> = [];
    const overlaps = (tableId: string, s: Date, e: Date): boolean =>
      store.some((r) => r.tableId === tableId && r.startTime < e && r.endTime > s);

    let chain: Promise<unknown> = Promise.resolve();
    vi.mocked(prisma.$transaction).mockImplementation(((
      fn: (client: unknown) => Promise<unknown>
    ) => {
      const tx = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(0),
        $executeRaw: vi.fn().mockResolvedValue(0),
        venue: { findUnique: vi.fn().mockResolvedValue({ settings: null }) },
        reservation: {
          findFirst: vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(overlaps("table-1", START, END) ? { id: "existing" } : null)
            ),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockImplementation(() => {
            store.push({ tableId: "table-1", startTime: START, endTime: END });
            return Promise.resolve({ id: `res-${store.length}` });
          }),
        },
        reservationHold: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
      };
      const run = chain.then(() => fn(tx));
      chain = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    }) as never);

    const intent = () =>
      baseIntent({
        write: async (tx: any) => tx.reservation.create({ data: {} }),
      });

    const [a, b] = await Promise.all([bookSlot(intent()), bookSlot(intent())]);

    const wins = [a, b].filter((r) => r.ok).length;
    expect(wins).toBe(1);
    expect(store.length).toBe(1);
  });
});
