/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type * as SlotRules from "./slot-rules.js";

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

vi.mock("./slot-rules.js", async (importOriginal) => {
  const actual = await importOriginal<typeof SlotRules>();
  return { ...actual, checkPacingForSlot: vi.fn().mockReturnValue(true) };
});

import { bookSlot, tableAdvisoryLockSql } from "./book-slot.js";
import { prisma } from "./database.js";
import {
  checkPacingForSlot,
  overlapWindow,
  activeHoldWindow,
  NOT_BOOKED_STATUSES,
} from "./slot-rules.js";

const DATE = new Date("2026-05-05");
const START = new Date("2026-05-05T18:00:00Z");
const END = new Date("2026-05-05T19:30:00Z");

/** Builds a partial transaction-client mock with all methods bookSlot may call. */
function makeTx(overrides: Record<string, unknown> = {}) {
  return {
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

describe("bookSlot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkPacingForSlot).mockReturnValue(true);
  });

  it("acquires the table advisory lock, then runs write when the slot is free", async () => {
    const tx = makeTx();
    useTxOnce(tx);
    const intent = baseIntent();

    const result = await bookSlot(intent);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("WRITTEN");
    // Lock acquired with the table-keyed advisory-lock SQL.
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const sql = vi.mocked(tx.$executeRaw).mock.calls[0][0] as { sql: string; values: unknown[] };
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

    const { where } = vi.mocked(tx.reservation.findFirst).mock.calls[0][0] as {
      where: { startTime: unknown; endTime: unknown; status: unknown };
    };
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

      const { where } = vi.mocked(tx.reservationHold.findFirst).mock.calls[0][0] as {
        where: { startTime: unknown; endTime: unknown; expiresAt: unknown };
      };
      const expectedWindow = overlapWindow(START, END);
      expect(where.startTime).toEqual(expectedWindow.startTime);
      expect(where.endTime).toEqual(expectedWindow.endTime);
      expect(where.expiresAt).toEqual(activeHoldWindow(now));
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-checks pacing under the lock and returns PACING_EXCEEDED when the limit is hit", async () => {
    vi.mocked(checkPacingForSlot).mockReturnValueOnce(false);
    const tx = makeTx();
    useTxOnce(tx);
    const intent = baseIntent({ checkPacing: true });

    const result = await bookSlot(intent);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflict.code).toBe("PACING_EXCEEDED");
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
