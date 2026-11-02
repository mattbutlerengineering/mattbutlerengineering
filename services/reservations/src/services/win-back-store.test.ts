import { describe, it, expect, vi } from "vitest";

vi.mock("./database.js", () => ({ prisma: {} }));

const {
  claimWinBack,
  markWinBackSent,
  releaseWinBackClaim,
  winBackStatusFor,
  WIN_BACK_COOLDOWN_MS,
} = await import("./win-back-store.js");

interface Row {
  venueId: string;
  guestId: string;
  claimedAt: Date | null;
  sentAt: Date | null;
}

type Where = { venueId: string; guestId: string; claimedAt?: Date | null };

function matches(row: Row | undefined, where: Where): row is Row {
  if (!row || row.venueId !== where.venueId) return false;
  if ("claimedAt" in where) {
    const wanted = where.claimedAt;
    if (wanted == null ? row.claimedAt !== null : row.claimedAt?.getTime() !== wanted.getTime()) {
      return false;
    }
  }
  return true;
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
    updateMany: vi.fn(async (args: { where: Where; data: Partial<Row> }) => {
      await tick();
      const row = rows.get(args.where.guestId);
      if (!matches(row, args.where)) return { count: 0 };
      rows.set(row.guestId, { ...row, ...args.data });
      return { count: 1 };
    }),
    create: vi.fn(async (args: { data: Row }) => {
      await tick();
      if (rows.has(args.data.guestId)) {
        throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      }
      rows.set(args.data.guestId, { ...args.data, sentAt: args.data.sentAt ?? null });
      return args.data;
    }),
    findFirst: vi.fn(async (args: { where: Where }) => {
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
const after = (ms: number) => new Date(now.getTime() + ms);

describe("claimWinBack", () => {
  it("claims a guest never sent to: records the claim time and no sent time", async () => {
    const { db, rows } = fakeDb();
    expect(await claimWinBack("v1", "g1", now, db)).toEqual({
      claimed: true,
      previousClaimedAt: null,
    });
    expect(rows.get("g1")).toMatchObject({ claimedAt: now, sentAt: null });
  });

  it("refuses a repeat inside the cooldown and reports the claim and its sent time", async () => {
    const { db } = fakeDb();
    await claimWinBack("v1", "g1", now, db);
    await markWinBackSent("v1", "g1", now, after(500), db);
    expect(await claimWinBack("v1", "g1", after(WIN_BACK_COOLDOWN_MS - 1), db)).toEqual({
      claimed: false,
      claimedAt: now,
      sentAt: after(500),
    });
  });

  it("refuses inside the cooldown after an unconfirmed attempt, with no sent time", async () => {
    const { db } = fakeDb();
    await claimWinBack("v1", "g1", now, db);
    expect(await claimWinBack("v1", "g1", after(1000), db)).toEqual({
      claimed: false,
      claimedAt: now,
      sentAt: null,
    });
  });

  it("claims again once the cooldown has passed, keeping the earlier sent time until the new send lands", async () => {
    const { db, rows } = fakeDb();
    await claimWinBack("v1", "g1", now, db);
    await markWinBackSent("v1", "g1", now, now, db);
    const later = after(WIN_BACK_COOLDOWN_MS);
    expect(await claimWinBack("v1", "g1", later, db)).toEqual({
      claimed: true,
      previousClaimedAt: now,
    });
    expect(rows.get("g1")).toMatchObject({ claimedAt: later, sentAt: now });
  });

  it("lets exactly one of two simultaneous first sends claim the guest", async () => {
    const { db } = fakeDb();
    const results = await Promise.all([
      claimWinBack("v1", "g1", now, db),
      claimWinBack("v1", "g1", now, db),
    ]);
    expect(results.filter((r) => r.claimed)).toHaveLength(1);
  });

  it("lets exactly one of several simultaneous sends after the cooldown claim the guest", async () => {
    const { db } = fakeDb();
    await claimWinBack("v1", "g1", now, db);
    const later = after(WIN_BACK_COOLDOWN_MS + 1000);
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

describe("markWinBackSent", () => {
  it("records the sent time on the claim it was given", async () => {
    const { db, rows } = fakeDb();
    await claimWinBack("v1", "g1", now, db);
    await markWinBackSent("v1", "g1", now, after(900), db);
    expect(rows.get("g1")?.sentAt).toEqual(after(900));
  });

  it("does not touch a newer claim", async () => {
    const { db, rows } = fakeDb();
    await claimWinBack("v1", "g1", now, db);
    const later = after(WIN_BACK_COOLDOWN_MS);
    await claimWinBack("v1", "g1", later, db);
    await markWinBackSent("v1", "g1", now, after(900), db);
    expect(rows.get("g1")).toMatchObject({ claimedAt: later, sentAt: null });
  });
});

describe("releaseWinBackClaim", () => {
  it("clears the claim so the next send can claim at once", async () => {
    const { db, rows } = fakeDb();
    await claimWinBack("v1", "g1", now, db);
    await releaseWinBackClaim("v1", "g1", now, null, db);
    expect(rows.get("g1")?.claimedAt).toBeNull();
    expect(await claimWinBack("v1", "g1", after(1000), db)).toMatchObject({ claimed: true });
  });

  it("cannot clear a newer claim", async () => {
    const { db, rows } = fakeDb();
    await claimWinBack("v1", "g1", now, db);
    const later = after(WIN_BACK_COOLDOWN_MS);
    await claimWinBack("v1", "g1", later, db);
    await releaseWinBackClaim("v1", "g1", now, null, db);
    expect(rows.get("g1")?.claimedAt).toEqual(later);
  });

  it("leaves an earlier confirmed send in place", async () => {
    const { db, rows } = fakeDb();
    await claimWinBack("v1", "g1", now, db);
    await markWinBackSent("v1", "g1", now, now, db);
    const later = after(WIN_BACK_COOLDOWN_MS);
    await claimWinBack("v1", "g1", later, db);
    await releaseWinBackClaim("v1", "g1", later, now, db);
    expect(rows.get("g1")).toMatchObject({ claimedAt: now, sentAt: now });
  });

  it("restores the previous UNCONFIRMED attempt instead of erasing it", async () => {
    const { db } = fakeDb();
    await claimWinBack("v1", "g1", now, db); // T0: ends ambiguously, never marked sent
    const later = after(WIN_BACK_COOLDOWN_MS + 1000);
    const renewal = await claimWinBack("v1", "g1", later, db);
    expect(renewal).toEqual({ claimed: true, previousClaimedAt: now });

    await releaseWinBackClaim("v1", "g1", later, now, db); // the renewal was rejected
    expect((await winBackStatusFor("v1", ["g1"], db)).get("g1")).toEqual({
      sentAt: null,
      attemptedAt: now,
    });
  });
});

describe("winBackStatusFor", () => {
  it("reports a confirmed send as sentAt with no attempt", async () => {
    const { db } = fakeDb();
    await claimWinBack("v1", "g1", now, db);
    await markWinBackSent("v1", "g1", now, after(5), db);
    const map = await winBackStatusFor("v1", ["g1"], db);
    expect(map.get("g1")).toEqual({ sentAt: after(5), attemptedAt: null });
  });

  it("reports a claim with no matching send as an unconfirmed attempt", async () => {
    const { db } = fakeDb();
    await claimWinBack("v1", "g1", now, db);
    expect(([...(await winBackStatusFor("v1", ["g1"], db))] as const)[0]?.[1]).toEqual({
      sentAt: null,
      attemptedAt: now,
    });
  });

  it("reports a renewed claim over an older send as an attempt, keeping the older sentAt", async () => {
    const { db } = fakeDb();
    await claimWinBack("v1", "g1", now, db);
    await markWinBackSent("v1", "g1", now, now, db);
    const later = after(WIN_BACK_COOLDOWN_MS);
    await claimWinBack("v1", "g1", later, db);
    expect((await winBackStatusFor("v1", ["g1"], db)).get("g1")).toEqual({
      sentAt: now,
      attemptedAt: later,
    });
  });

  it("reports a released claim as nothing attempted", async () => {
    const { db } = fakeDb();
    await claimWinBack("v1", "g1", now, db);
    await releaseWinBackClaim("v1", "g1", now, null, db);
    expect((await winBackStatusFor("v1", ["g1"], db)).get("g1")).toEqual({
      sentAt: null,
      attemptedAt: null,
    });
  });

  it("maps only the venue's own guests, and never queries for none", async () => {
    const { db, delegate } = fakeDb();
    await claimWinBack("v1", "g1", now, db);
    await claimWinBack("v2", "g2", now, db);
    const map = await winBackStatusFor("v1", ["g1", "g2", "g3"], db);
    expect([...map.keys()]).toEqual(["g1"]);
    expect(delegate.findMany.mock.calls[0]?.[0].where.venueId).toBe("v1");
    delegate.findMany.mockClear();
    expect((await winBackStatusFor("v1", [], db)).size).toBe(0);
    expect(delegate.findMany).not.toHaveBeenCalled();
  });
});
