import { describe, it, expect, vi } from "vitest";

vi.mock("./database.js", () => ({ prisma: {} }));

const { claimWinBack, lastWinBackSentAt, WIN_BACK_COOLDOWN_MS } =
  await import("./win-back-store.js");

interface Row {
  venueId: string;
  guestId: string;
  lastSentAt: Date;
}

/**
 * An in-memory `guestWinBack` delegate with the two properties the store relies on:
 * `guestId` is UNIQUE (`create` rejects with P2002) and `updateMany` is one atomic
 * compare-and-set. Each call yields first, so concurrent callers genuinely interleave.
 */
function fakeDb() {
  const rows = new Map<string, Row>();
  const tick = () => new Promise((r) => setImmediate(r));
  const delegate = {
    updateMany: vi.fn(
      async (args: {
        where: { venueId: string; guestId: string; lastSentAt: { lte: Date } };
        data: { lastSentAt: Date };
      }) => {
        await tick();
        const row = rows.get(args.where.guestId);
        if (
          !row ||
          row.venueId !== args.where.venueId ||
          row.lastSentAt.getTime() > args.where.lastSentAt.lte.getTime()
        ) {
          return { count: 0 };
        }
        rows.set(row.guestId, { ...row, lastSentAt: args.data.lastSentAt });
        return { count: 1 };
      }
    ),
    create: vi.fn(async (args: { data: Row }) => {
      await tick();
      if (rows.has(args.data.guestId)) {
        throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      }
      rows.set(args.data.guestId, args.data);
      return args.data;
    }),
    findFirst: vi.fn(async (args: { where: { venueId: string; guestId: string } }) => {
      const row = rows.get(args.where.guestId);
      return row && row.venueId === args.where.venueId ? row : null;
    }),
    findMany: vi.fn(async (args: { where: { venueId: string; guestId: { in: string[] } } }) =>
      [...rows.values()].filter(
        (r) => r.venueId === args.where.venueId && args.where.guestId.in.includes(r.guestId)
      )
    ),
  };
  return { db: { guestWinBack: delegate } as never, rows, delegate };
}

const now = new Date("2026-11-01T12:00:00Z");

describe("claimWinBack", () => {
  it("claims a guest never sent to, and records the time", async () => {
    const { db, rows } = fakeDb();
    expect(await claimWinBack("v1", "g1", now, db)).toEqual({ claimed: true });
    expect(rows.get("g1")?.lastSentAt).toEqual(now);
  });

  it("refuses a repeat inside the cooldown and reports when the last one went", async () => {
    const { db } = fakeDb();
    await claimWinBack("v1", "g1", now, db);
    const later = new Date(now.getTime() + WIN_BACK_COOLDOWN_MS - 1);
    expect(await claimWinBack("v1", "g1", later, db)).toEqual({
      claimed: false,
      lastSentAt: now,
    });
  });

  it("claims again once the cooldown has passed", async () => {
    const { db, rows } = fakeDb();
    await claimWinBack("v1", "g1", now, db);
    const later = new Date(now.getTime() + WIN_BACK_COOLDOWN_MS);
    expect(await claimWinBack("v1", "g1", later, db)).toEqual({ claimed: true });
    expect(rows.get("g1")?.lastSentAt).toEqual(later);
  });

  it("lets exactly one of two simultaneous first sends claim the guest", async () => {
    const { db } = fakeDb();
    const results = await Promise.all([
      claimWinBack("v1", "g1", now, db),
      claimWinBack("v1", "g1", now, db),
    ]);
    expect(results.filter((r) => r.claimed)).toHaveLength(1);
    expect(results.find((r) => !r.claimed)).toEqual({ claimed: false, lastSentAt: now });
  });

  it("lets exactly one of several simultaneous sends after the cooldown claim the guest", async () => {
    const { db } = fakeDb();
    await claimWinBack("v1", "g1", now, db);
    const later = new Date(now.getTime() + WIN_BACK_COOLDOWN_MS + 1000);
    const results = await Promise.all([1, 2, 3, 4].map(() => claimWinBack("v1", "g1", later, db)));
    expect(results.filter((r) => r.claimed)).toHaveLength(1);
  });

  it("scopes every query to the venue", async () => {
    const { db, delegate } = fakeDb();
    await claimWinBack("v1", "g1", now, db);
    await claimWinBack("v1", "g1", now, db);
    expect(delegate.updateMany.mock.calls.every(([a]) => a.where.venueId === "v1")).toBe(true);
    expect(delegate.findFirst.mock.calls.every(([a]) => a.where.venueId === "v1")).toBe(true);
    expect(delegate.create.mock.calls.every(([a]) => a.data.venueId === "v1")).toBe(true);
  });
});

describe("lastWinBackSentAt", () => {
  it("maps guest id to last send time for the venue's guests only", async () => {
    const { db, delegate } = fakeDb();
    await claimWinBack("v1", "g1", now, db);
    await claimWinBack("v2", "g2", now, db);
    const map = await lastWinBackSentAt("v1", ["g1", "g2", "g3"], db);
    expect([...map.entries()]).toEqual([["g1", now]]);
    expect(delegate.findMany.mock.calls[0]?.[0].where.venueId).toBe("v1");
  });

  it("does not query when there are no guests", async () => {
    const { db, delegate } = fakeDb();
    expect((await lastWinBackSentAt("v1", [], db)).size).toBe(0);
    expect(delegate.findMany).not.toHaveBeenCalled();
  });
});
