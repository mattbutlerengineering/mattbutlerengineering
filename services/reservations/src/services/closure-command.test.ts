import { describe, expect, it, vi } from "vitest";
import type { CreateClosureBody, DateRule } from "@mbe/types";

vi.mock("./database.js", () => ({ prisma: {} }));

const { createClosure, reopenClosure, mayClose } = await import("./closure-command.js");

const NOW = new Date("2026-10-25T19:00:00.000Z"); // Sun Oct 25, noon in Los Angeles
const TZ = "America/Los_Angeles";
const MANAGER = { isManager: true, actorId: "user-1" };
const HOST = { isManager: false, actorId: "host-1" };

interface Res {
  id: string;
  status: string;
  tableId: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  partySize: number;
  guestName: string;
  deposit: { amountCents: number; currency: string; status: string } | null;
}

interface Hold {
  tableId: string;
  startTime: Date;
  endTime: Date;
  expiresAt: Date;
}

const res = (
  id: string,
  date: string,
  startIso: string,
  endIso: string,
  deposit = true,
  tableId = "t-1"
): Res => ({
  id,
  status: "CONFIRMED",
  tableId,
  date: new Date(`${date}T00:00:00.000Z`),
  startTime: new Date(startIso),
  endTime: new Date(endIso),
  partySize: 2,
  guestName: id,
  deposit: deposit ? { amountCents: 4000, currency: "usd", status: "held" } : null,
});

interface World {
  version: number;
  hostEmergencyClose: boolean;
  /** The one service every day runs, in minutes from the service day's midnight. */
  service: { opensAt: number; lastSeatingAt: number; closesAt: number };
  reservations: Res[];
  holds: Hold[];
  dateRules: Record<string, unknown>[];
  changes: {
    id: string;
    actorId: string;
    inverse: unknown;
    kind: string;
    notifiedGuests: boolean;
    summary: string;
  }[];
  outcomes: Record<string, unknown>[];
  events: { reservationId: string; kind: string; actorId: string }[];
  /** Counts every write that would have moved money; the closure must make none. */
  deposits: { writes: number };
}

function world(patch: Partial<World> = {}): World {
  return {
    version: 4,
    hostEmergencyClose: false,
    service: { opensAt: 1020, lastSeatingAt: 1260, closesAt: 1380 },
    reservations: [
      res("res-1", "2026-12-24", "2026-12-25T03:00:00.000Z", "2026-12-25T04:30:00.000Z"),
      res("res-2", "2026-12-24", "2026-12-25T03:30:00.000Z", "2026-12-25T05:00:00.000Z", false),
    ],
    holds: [],
    dateRules: [],
    changes: [],
    outcomes: [],
    events: [],
    deposits: { writes: 0 },
    ...patch,
  };
}

/** The query shapes the closure store sends, as far as the fake reads them. */
interface Where {
  /** A plain id in one query, `{ in }` / `{ not }` in others. */
  id: string & { in: string[]; not: string };
  tableId: string;
  status: string;
  startTime: { lt: Date };
  endTime: { gt: Date };
  dateRuleId: string;
  inverse: { path: string[]; equals: unknown };
}

interface HoldWhere {
  tableId: string;
  expiresAt: { gt: Date };
  startTime: { lt: Date };
  endTime: { gt: Date };
}

function reservationDelegate(w: World) {
  return {
    findMany: vi.fn(async ({ where }: { where: Where }) =>
      w.reservations.filter((r) =>
        where.id?.in ? where.id.in.includes(r.id) : r.status !== "CANCELLED"
      )
    ),
    findFirst: vi.fn(async ({ where }: { where: Where }) => {
      const clash = w.reservations.find(
        (r) =>
          r.id !== where.id.not &&
          r.tableId === where.tableId &&
          r.status !== "CANCELLED" &&
          r.startTime < where.startTime.lt &&
          r.endTime > where.endTime.gt
      );
      return clash ? { id: clash.id } : null;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Where; data: Partial<Res> }) => {
      const r = w.reservations.find((x) => x.id === where.id && x.status === where.status);
      if (!r) return { count: 0 };
      Object.assign(r, data);
      return { count: 1 };
    }),
  };
}

function outcomeDelegate(w: World) {
  return {
    count: vi.fn(
      async ({ where }: { where: Where }) =>
        w.outcomes.filter((o) => o.dateRuleId === where.dateRuleId).length
    ),
    createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
      w.outcomes = [
        ...w.outcomes,
        ...data.map((d, i) => ({ id: `o-${w.outcomes.length + i}`, ...d })),
      ];
    }),
    findMany: vi.fn(async ({ where }: { where: Where }) =>
      w.outcomes.filter((o) => o.dateRuleId === where.dateRuleId)
    ),
  };
}

function changeDelegate(w: World) {
  return {
    findFirst: vi.fn(async ({ where }: { where: Where }) => {
      const path = where.inverse?.path as string[] | undefined;
      if (!path) return w.changes.at(-1) ?? null;
      const wanted = where.inverse.equals;
      return (
        [...w.changes]
          .reverse()
          .find(
            (c) =>
              (c.inverse as { closure?: Record<string, unknown> }).closure?.[path[1]!] === wanted
          ) ?? null
      );
    }),
    create: vi.fn(async ({ data }: { data: World["changes"][number] }) => {
      const change = { ...data, id: `chg-${w.changes.length + 1}` };
      w.changes = [...w.changes, change];
      return { id: change.id };
    }),
  };
}

/** A client whose transactions read and write one in-memory world. */
function fakeClient(w: World) {
  const tx = {
    $executeRaw: vi.fn(async (..._args: unknown[]) => 0),
    $executeRawUnsafe: vi.fn(async () => 0),
    schedule: {
      findMany: vi.fn(async () => [
        {
          id: "sch-1",
          venueId: "v",
          name: "Regular",
          kind: "regular",
          isRegular: true,
          archivedAt: null,
        },
      ]),
    },
    venueService: {
      findMany: vi.fn(async () => [
        { id: "vs-dinner", venueId: "v", name: "Dinner", position: 0, archivedAt: null },
      ]),
    },
    scheduleService: {
      findMany: vi.fn(async () => [
        {
          id: "ss-1",
          venueId: "v",
          scheduleId: "sch-1",
          venueServiceId: "vs-dinner",
          ...w.service,
          seating: { version: 1, interval: 15 },
          bookingTypes: ["online", "phone"],
        },
      ]),
    },
    scheduleAssignment: {
      findMany: vi.fn(async () => [
        {
          id: "as-1",
          venueId: "v",
          scheduleId: "sch-1",
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          startsOn: null,
          endsOn: null,
          precedence: 0,
        },
      ]),
    },
    dateRule: {
      findMany: vi.fn(async () => w.dateRules),
      create: vi.fn(async ({ data }: { data: { id: string } & Record<string, unknown> }) => {
        w.dateRules = [...w.dateRules, { venueId: "v", deletedAt: null, tables: [], ...data }];
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
    },
    dateRuleTable: { createMany: vi.fn(async () => ({})), deleteMany: vi.fn(async () => ({})) },
    venue: {
      findUnique: vi.fn(async () => ({
        ianaTimezone: TZ,
        settings: {},
        operatingHours: null,
        availabilityVersion: w.version,
        hostEmergencyClose: w.hostEmergencyClose,
      })),
      updateMany: vi.fn(async ({ where }: { where: { availabilityVersion: number } }) => {
        if (where.availabilityVersion !== w.version) return { count: 0 };
        w.version += 1;
        return { count: 1 };
      }),
      update: vi.fn(async ({ data }: { data?: { availabilityVersion?: unknown } } = {}) => {
        if (data?.availabilityVersion) w.version += 1; // only the reopen bumps here
        return { availabilityVersion: w.version };
      }),
    },
    table: { findMany: vi.fn(async () => [{ id: "t-1" }]) },
    reservation: reservationDelegate(w),
    reservationHold: {
      findFirst: vi.fn(async ({ where }: { where: HoldWhere }) => {
        const hold = w.holds.find(
          (h) =>
            h.tableId === where.tableId &&
            h.expiresAt > where.expiresAt.gt &&
            h.startTime < where.startTime.lt &&
            h.endTime > where.endTime.gt
        );
        return hold ? { id: "hold-1" } : null;
      }),
    },
    reservationEvent: {
      create: vi.fn(
        async ({ data }: { data: { reservationId: string; kind: string; actorId: string } }) => {
          w.events = [...w.events, data];
        }
      ),
    },
    // Stripe is down for the whole suite: a deposit write would be a failure.
    deposit: { updateMany: vi.fn(async () => (w.deposits.writes++, { count: 0 })) },
    availabilityChange: changeDelegate(w),
    closureOutcome: outcomeDelegate(w),
  };
  const client = {
    $transaction: vi.fn(async (work: (t: unknown) => Promise<unknown>) => {
      const snapshot = {
        version: w.version,
        reservations: w.reservations.map((r) => ({ ...r })),
        dateRules: w.dateRules,
        changes: w.changes,
        outcomes: w.outcomes,
        events: w.events,
      };
      try {
        return await work(tx);
      } catch (error) {
        Object.assign(w, snapshot); // a refusal rolls the whole transaction back
        throw error;
      }
    }),
  } as never;
  return { client, tx };
}

const closure = (patch: Partial<DateRule> = {}) =>
  ({
    id: "dr-new",
    kind: "closure",
    targetKind: "venue",
    startsOn: "2026-12-24",
    endsOn: "2026-12-24",
    ...patch,
  }) as DateRule;

const body = (patch: Partial<CreateClosureBody> = {}): CreateClosureBody => ({
  expectedVersion: 4,
  rule: closure(),
  decisions: [{ groupKey: "2026-12-24:closed", action: "cancel" }],
  ...patch,
});

const run = async (
  w: World,
  b: CreateClosureBody,
  opts: { key?: string; caller?: typeof MANAGER; now?: Date } = {}
) => {
  const { client, tx } = fakeClient(w);
  const outcome = await createClosure(
    {
      venueId: "v",
      caller: opts.caller ?? MANAGER,
      body: b,
      idempotencyKey: opts.key ?? "key-1",
      now: opts.now ?? NOW,
    },
    client
  );
  return { outcome, tx };
};

const active = (w: World) => w.reservations.filter((r) => r.status !== "CANCELLED");

const SHORTENED = {
  id: "dr-new",
  kind: "special_hours",
  targetKind: "venue",
  startsOn: "2026-12-24",
  endsOn: "2026-12-24",
  payload: {
    version: 1,
    services: [
      {
        venueServiceId: "vs-dinner",
        opensAt: 960,
        lastSeatingAt: 1080,
        closesAt: 1200,
        seating: { version: 1, interval: 15 },
        bookingTypes: ["online", "phone"],
      },
    ],
  },
} as DateRule;

describe("createClosure", () => {
  it("cancels the group in the transaction, with events, leaving the deposit held for the refund job", async () => {
    const w = world();
    const { outcome, tx } = await run(w, body());

    expect(outcome).toMatchObject({
      kind: "saved",
      result: {
        ruleId: "dr-new",
        version: 5,
        outcomes: { cancel: 2, move: 0, keep_notify: 0, keep_silent: 0 },
      },
    });
    expect(w.reservations.map((r) => r.status)).toEqual(["CANCELLED", "CANCELLED"]);
    expect(w.events).toEqual([
      expect.objectContaining({ reservationId: "res-1", kind: "cancelled", actorId: "user-1" }),
      expect.objectContaining({ reservationId: "res-2", kind: "cancelled", actorId: "user-1" }),
    ]);
    const rows = tx.closureOutcome.createMany.mock.calls[0]![0].data;
    expect(rows).toEqual([
      expect.objectContaining({ reservationId: "res-1", action: "cancel", refund: "pending" }),
      expect.objectContaining({ reservationId: "res-2", action: "cancel", refund: "none" }),
    ]);
    expect(w.deposits.writes).toBe(0);
    expect(w.changes[0]).toMatchObject({ kind: "closure", notifiedGuests: true });
  });

  it("keeps and notifies without touching the reservations", async () => {
    const w = world();
    const { outcome } = await run(
      w,
      body({ decisions: [{ groupKey: "2026-12-24:closed", action: "keep_notify" }] })
    );
    expect(outcome).toMatchObject({ kind: "saved", result: { outcomes: { keep_notify: 2 } } });
    expect(active(w)).toHaveLength(2);
    expect(w.events).toEqual([]);
  });

  it("keeps silently only with the acknowledgement, recording who and notifying nobody", async () => {
    const refused = await run(
      world(),
      body({ decisions: [{ groupKey: "2026-12-24:closed", action: "keep_silent" }] })
    );
    expect(refused.outcome).toEqual({
      kind: "decision_required",
      groupKeys: ["2026-12-24:closed"],
    });

    const w = world();
    const { outcome, tx } = await run(
      w,
      body({
        decisions: [{ groupKey: "2026-12-24:closed", action: "keep_silent", acknowledged: true }],
      })
    );
    expect(outcome.kind).toBe("saved");
    expect(tx.closureOutcome.createMany.mock.calls[0]![0].data[0]).toMatchObject({
      action: "keep_silent",
      acknowledgedBy: "user-1",
    });
    expect(w.changes[0]!.notifiedGuests).toBe(false);
  });

  it("moves a shortened group to the nearest open time, with an event", async () => {
    const w = world({
      reservations: [
        res("res-1", "2026-12-24", "2026-12-25T03:00:00.000Z", "2026-12-25T04:30:00.000Z"),
      ],
    });
    const { outcome, tx } = await run(
      w,
      body({ rule: SHORTENED, decisions: [{ groupKey: "2026-12-24:shortened", action: "move" }] })
    );

    expect(outcome).toMatchObject({ kind: "saved", result: { outcomes: { move: 1 } } });
    expect(tx.closureOutcome.createMany.mock.calls[0]![0].data[0]).toMatchObject({
      action: "move",
      movedTo: new Date("2026-12-25T02:00:00.000Z"), // 6:00 PM in Los Angeles
    });
    expect(w.reservations[0]).toMatchObject({
      startTime: new Date("2026-12-25T02:00:00.000Z"),
      endTime: new Date("2026-12-25T03:30:00.000Z"),
    });
    expect(w.events).toEqual([expect.objectContaining({ kind: "moved" })]);
  });

  it("refuses the whole request when a move lands on a taken table, saving nothing", async () => {
    const w = world({
      reservations: [
        res("res-1", "2026-12-24", "2026-12-25T03:00:00.000Z", "2026-12-25T04:30:00.000Z"),
        res("res-9", "2026-12-24", "2026-12-25T01:30:00.000Z", "2026-12-25T03:00:00.000Z", false),
      ],
    });
    const { outcome } = await run(
      w,
      body({ rule: SHORTENED, decisions: [{ groupKey: "2026-12-24:shortened", action: "move" }] })
    );

    expect(outcome).toEqual({ kind: "move_unavailable", reservationIds: ["res-1"] });
    expect(w.version).toBe(4);
    expect(w.dateRules).toHaveLength(0);
    expect(w.outcomes).toHaveLength(0);
    expect(w.events).toHaveLength(0);
    expect(w.reservations[0]!.startTime).toEqual(new Date("2026-12-25T03:00:00.000Z"));
  });

  it("takes the table's advisory lock before a move's clash check", async () => {
    const w = world({
      reservations: [
        res("res-1", "2026-12-24", "2026-12-25T03:00:00.000Z", "2026-12-25T04:30:00.000Z"),
      ],
    });
    const { outcome, tx } = await run(
      w,
      body({ rule: SHORTENED, decisions: [{ groupKey: "2026-12-24:shortened", action: "move" }] })
    );
    expect(outcome).toMatchObject({ kind: "saved" });
    const lockCall = tx.$executeRaw.mock.calls.findIndex((c) =>
      JSON.stringify(c[0]).includes("pg_advisory_xact_lock")
    );
    expect(lockCall).toBeGreaterThanOrEqual(0);
    expect(tx.$executeRaw.mock.invocationCallOrder[lockCall]!).toBeLessThan(
      tx.reservation.findFirst.mock.invocationCallOrder[0]!
    );
  });

  it("refuses a move onto a table held for another guest, saving nothing", async () => {
    const w = world({
      reservations: [
        res("res-1", "2026-12-24", "2026-12-25T03:00:00.000Z", "2026-12-25T04:30:00.000Z"),
      ],
      holds: [
        {
          tableId: "t-1",
          startTime: new Date("2026-12-25T02:30:00.000Z"),
          endTime: new Date("2026-12-25T03:15:00.000Z"),
          expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        },
      ],
    });
    const { outcome } = await run(
      w,
      body({ rule: SHORTENED, decisions: [{ groupKey: "2026-12-24:shortened", action: "move" }] })
    );
    expect(outcome).toEqual({ kind: "move_unavailable", reservationIds: ["res-1"] });
    expect(w.version).toBe(4);
    expect(w.outcomes).toHaveLength(0);
    expect(w.events).toHaveLength(0);
    expect(w.reservations[0]!.startTime).toEqual(new Date("2026-12-25T03:00:00.000Z"));
  });

  it("refuses a move on a closed day", async () => {
    const { outcome } = await run(
      world(),
      body({ decisions: [{ groupKey: "2026-12-24:closed", action: "move" }] })
    );
    expect(outcome).toEqual({ kind: "invalid_decision", groupKeys: ["2026-12-24:closed"] });
  });

  it("refuses a rule kind the command does not save", async () => {
    const tonight = {
      id: "dr-new",
      kind: "tonight",
      targetKind: "venue",
      startsOn: "2026-12-24",
      endsOn: "2026-12-24",
      payload: { version: 1, closeAt: 1300 },
    } as unknown as DateRule;
    const { outcome } = await run(world(), body({ rule: tonight, decisions: [] }));
    expect(outcome).toMatchObject({ kind: "invalid", issues: [{ code: "unsupported_kind" }] });
  });

  it("leaves no active reservation under the closure unless its outcome is keep", async () => {
    const w = world({
      reservations: [
        res("res-1", "2026-12-24", "2026-12-25T03:00:00.000Z", "2026-12-25T04:30:00.000Z"),
        res("res-3", "2026-12-25", "2026-12-26T03:00:00.000Z", "2026-12-26T04:30:00.000Z"),
      ],
    });
    const { outcome } = await run(
      w,
      body({
        rule: closure({ endsOn: "2026-12-25" }),
        decisions: [
          { groupKey: "2026-12-24:closed", action: "cancel" },
          { groupKey: "2026-12-25:closed", action: "keep_notify" },
        ],
      })
    );

    expect(outcome).toMatchObject({
      kind: "saved",
      result: { outcomes: { cancel: 1, keep_notify: 1 } },
    });
    expect(w.outcomes).toHaveLength(2);
    const ruleStart = new Date("2026-12-24T00:00:00.000Z").getTime();
    const ruleEnd = new Date("2026-12-26T08:00:00.000Z").getTime();
    const overlapping = w.reservations.filter(
      (r) => r.startTime.getTime() < ruleEnd && r.endTime.getTime() > ruleStart
    );
    expect(overlapping.length).toBeGreaterThanOrEqual(2);
    for (const r of overlapping) {
      const o = w.outcomes.find((x) => x.reservationId === r.id);
      expect(r.status === "CANCELLED" || String(o?.action).startsWith("keep_")).toBe(true);
    }
    expect(w.deposits.writes).toBe(0);
  });

  it("saves nothing when a group has no decision", async () => {
    const w = world();
    const { outcome } = await run(w, body({ decisions: [] }));
    expect(outcome).toEqual({ kind: "decision_required", groupKeys: ["2026-12-24:closed"] });
    expect(w.version).toBe(4);
    expect(w.dateRules).toHaveLength(0);
    expect(w.outcomes).toHaveLength(0);
  });

  it("replays the same key to the stored result, changing nothing", async () => {
    const w = world();
    const first = await run(w, body());
    const events = w.events.length;
    const second = await run(w, body());

    expect(second.outcome).toEqual(first.outcome);
    expect(w.version).toBe(5);
    expect(w.dateRules).toHaveLength(1);
    expect(w.outcomes).toHaveLength(2);
    expect(w.events).toHaveLength(events);
  });

  it("refuses a key reused for a different closure", async () => {
    const w = world();
    await run(w, body());
    const { outcome } = await run(w, body({ rule: closure({ id: "dr-other" }) }));
    expect(outcome).toEqual({ kind: "key_reused" });
  });

  it("refuses the same rule id again under a new key as already saved, not a 500", async () => {
    const w = world();
    await run(w, body());
    const { outcome } = await run(w, body({ expectedVersion: 5 }), { key: "key-2" });
    expect(outcome).toEqual({ kind: "closure_exists" });
    expect(w.version).toBe(5);
  });

  it("refuses the same rule id under a new key as already saved when the day had no bookings", async () => {
    const w = world({ reservations: [] });
    const first = await run(w, body({ decisions: [] }));
    expect(first.outcome.kind).toBe("saved");
    const { outcome } = await run(w, body({ expectedVersion: 5, decisions: [] }), {
      key: "key-2",
    });
    expect(outcome).toEqual({ kind: "closure_exists" });
    expect(w.version).toBe(5);
  });

  it("marks a cancelled booking's pending deposit for refund, like a held one", async () => {
    const w = world();
    w.reservations[0]!.deposit = { amountCents: 4000, currency: "usd", status: "pending" };
    const { tx } = await run(w, body());
    expect(tx.closureOutcome.createMany.mock.calls[0]![0].data[0]).toMatchObject({
      reservationId: "res-1",
      refund: "pending",
    });
  });

  it("answers a stale version with the winning change", async () => {
    const w = world({ version: 7 });
    const { outcome } = await run(w, body({ expectedVersion: 4 }));
    expect(outcome.kind).toBe("version_conflict");
    expect(w.dateRules).toHaveLength(0);
  });

  describe("a series growth edit (alongside)", () => {
    /** Thursdays from Dec 1, as the stored row; the edit adds Fridays from Dec 10. */
    const storedSeries = {
      id: "s1",
      venueId: "v",
      kind: "closure",
      targetKind: "venue",
      venueServiceId: null,
      bookingTypes: [],
      startsOn: new Date("2026-12-01T00:00:00.000Z"),
      endsOn: null,
      repeat: { version: 1, weekdays: [4] },
      window: null,
      payload: null,
      useScheduleId: null,
      seriesId: null,
      guestMessage: null,
      staffNote: null,
      expiresAt: null,
      deletedAt: null,
      tables: [],
    };
    const friday = (id: string) =>
      res(id, "2026-12-25", "2026-12-26T03:00:00.000Z", "2026-12-26T04:30:00.000Z");
    const growth = (): World =>
      world({ dateRules: [storedSeries], reservations: [friday("res-1"), friday("res-2")] });
    const split = (): Partial<CreateClosureBody> => ({
      rule: closure({
        id: "s2",
        startsOn: "2026-12-10",
        endsOn: null,
        repeat: { version: 1, weekdays: [4, 5] },
      }),
      alongside: {
        upsert: [
          {
            id: "s1",
            kind: "closure",
            targetKind: "venue",
            startsOn: "2026-12-01",
            endsOn: "2026-12-09",
            repeat: { version: 1, weekdays: [4] },
          },
        ],
        remove: [],
      },
      decisions: [{ groupKey: "2026-12-25:closed", action: "cancel" }],
    });

    it("cancels the newly closed dates and splits the series in one save", async () => {
      const w = growth();
      const { outcome, tx } = await run(w, body(split()));

      expect(outcome).toMatchObject({
        kind: "saved",
        result: { ruleId: "s2", outcomes: { cancel: 2 } },
      });
      expect(w.reservations.map((r) => r.status)).toEqual(["CANCELLED", "CANCELLED"]);
      expect(tx.dateRule.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ id: "s2" }) })
      );
      expect(tx.dateRule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "s1" },
          data: expect.objectContaining({ endsOn: new Date("2026-12-09T00:00:00.000Z") }),
        })
      );
    });

    it("asks for the decision first and writes neither the series nor a cancel without it", async () => {
      const w = growth();
      const { outcome, tx } = await run(w, body({ ...split(), decisions: [] }));

      expect(outcome).toEqual({ kind: "decision_required", groupKeys: ["2026-12-25:closed"] });
      expect(w.reservations.map((r) => r.status)).toEqual(["CONFIRMED", "CONFIRMED"]);
      expect(tx.dateRule.create).not.toHaveBeenCalled();
      expect(tx.dateRule.update).not.toHaveBeenCalled();
      expect(w.version).toBe(4);
    });

    it("leaves a date the replaced series already closed out of the decisions", async () => {
      const w = world({
        dateRules: [storedSeries],
        reservations: [
          res("thu", "2026-12-24", "2026-12-25T03:00:00.000Z", "2026-12-25T04:30:00.000Z"),
        ],
      });
      const { outcome } = await run(w, body({ ...split(), decisions: [] }));
      expect(outcome.kind).toBe("saved");
      expect(w.reservations[0]!.status).toBe("CONFIRMED");
    });

    it("is a Manager's change", async () => {
      const { outcome } = await run(growth(), body(split()), { caller: HOST });
      expect(outcome).toEqual({ kind: "forbidden" });
    });

    it("refuses to write anything but closures and skips beside the closure", async () => {
      const bad = split();
      const { outcome } = await run(
        growth(),
        body({
          ...bad,
          alongside: { upsert: [{ ...SHORTENED, id: "sh-1" }], remove: [] },
        })
      );
      expect(outcome).toMatchObject({ kind: "invalid" });
    });
  });

  describe("Host emergency limits", () => {
    const tonight = closure({ id: "dr-tonight", startsOn: "2026-10-25", endsOn: "2026-10-25" });
    const none = { reservations: [] };

    it("allows the whole-venue close for tonight when the grant is on", async () => {
      const w = world({ hostEmergencyClose: true, ...none });
      const { outcome } = await run(w, body({ rule: tonight, decisions: [] }), { caller: HOST });
      expect(outcome.kind).toBe("saved");
    });

    it.each([
      ["the grant is off", false, tonight],
      ["it is another date", true, closure({ startsOn: "2026-10-26", endsOn: "2026-10-26" })],
      [
        "it targets one service",
        true,
        { ...tonight, targetKind: "service", venueServiceId: "vs-dinner" },
      ],
      ["it is a time window", true, { ...tonight, window: { version: 1, from: 1200, to: 1260 } }],
    ])("refuses a Host when %s", async (_why, grant, rule) => {
      const w = world({ hostEmergencyClose: grant as boolean, ...none });
      const { outcome } = await run(w, body({ rule: rule as DateRule, decisions: [] }), {
        caller: HOST,
      });
      expect(outcome).toEqual({ kind: "forbidden" });
      expect(w.version).toBe(4);
    });

    it("treats a Friday 22:00-02:00 service as Friday's at Saturday 00:30", async () => {
      const overnight = { opensAt: 1320, lastSeatingAt: 1500, closesAt: 1560 };
      const satHalfPast12 = new Date("2026-10-31T07:30:00.000Z"); // Sat 00:30 PDT
      const friday = closure({ id: "dr-fri", startsOn: "2026-10-30", endsOn: "2026-10-30" });
      const saturday = closure({ id: "dr-sat", startsOn: "2026-10-31", endsOn: "2026-10-31" });

      const ok = world({ hostEmergencyClose: true, service: overnight, ...none });
      const fri = await run(ok, body({ rule: friday, decisions: [] }), {
        caller: HOST,
        now: satHalfPast12,
      });
      expect(fri.outcome.kind).toBe("saved");

      const no = world({ hostEmergencyClose: true, service: overnight, ...none });
      const sat = await run(no, body({ rule: saturday, decisions: [] }), {
        caller: HOST,
        now: satHalfPast12,
      });
      expect(sat.outcome).toEqual({ kind: "forbidden" });
    });

    it("lets the Host who saved the close replay it after the day has passed, and no other Host", async () => {
      const w = world({ hostEmergencyClose: true, ...none });
      const first = await run(w, body({ rule: tonight, decisions: [] }), { caller: HOST });
      const nextWeek = new Date("2026-11-02T19:00:00.000Z");

      const same = await run(w, body({ rule: tonight, decisions: [] }), {
        caller: HOST,
        now: nextWeek,
      });
      expect(same.outcome).toEqual(first.outcome);

      const other = await run(w, body({ rule: tonight, decisions: [] }), {
        caller: { isManager: false, actorId: "host-2" },
        now: nextWeek,
      });
      expect(other.outcome).toEqual({ kind: "forbidden" });
    });
  });
});

describe("mayClose", () => {
  it("lets a Manager preview anything and a Host only the emergency close", async () => {
    const w = world({ hostEmergencyClose: true });
    const { client } = fakeClient(w);
    const tonight = closure({ startsOn: "2026-10-25", endsOn: "2026-10-25" });
    expect(await mayClose("v", true, closure(), NOW, client)).toBe(true);
    expect(await mayClose("v", false, tonight, NOW, client)).toBe(true);
    expect(await mayClose("v", false, closure(), NOW, client)).toBe(false);
  });
});

describe("reopenClosure", () => {
  const rowFor = (kind: string) => ({
    id: "dr-new",
    venueId: "v",
    kind,
    targetKind: "venue",
    bookingTypes: [],
    tables: [],
    startsOn: new Date("2026-12-24T00:00:00.000Z"),
    endsOn: new Date("2026-12-24T00:00:00.000Z"),
    payload: {},
    source: "manual",
    deletedAt: null,
    venueServiceId: null,
    useScheduleId: null,
    expiresAt: null,
    repeat: null,
    window: null,
    seriesId: null,
    guestMessage: null,
    staffNote: null,
  });
  const reopen = (w: World, caller = MANAGER, ruleId = "dr-new") => {
    const { client, tx } = fakeClient(w);
    return reopenClosure(
      { venueId: "v", ruleId, caller, tellCancelledGuests: true, now: NOW },
      client
    ).then((outcome) => ({ outcome, tx }));
  };

  it("soft-deletes the rule and bumps the version, leaving cancelled guests cancelled", async () => {
    const w = world();
    await run(w, body());
    w.dateRules = [rowFor("closure")];

    const { outcome, tx } = await reopen(w);

    expect(outcome).toMatchObject({ kind: "reopened", result: { changeId: expect.any(String) } });
    expect(tx.dateRule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deletedAt: NOW } })
    );
    expect(active(w)).toHaveLength(0);
    expect(w.changes.at(-1)).toMatchObject({ kind: "reopen", notifiedGuests: true });
  });

  it("answers a replay of the original key after the reopen with the stored result, changing nothing", async () => {
    const w = world();
    const first = await run(w, body());
    w.dateRules = [rowFor("closure")];
    await reopen(w);
    const [events, changes, version] = [w.events.length, w.changes.length, w.version];

    const replay = await run(w, body());

    expect(replay.outcome).toEqual(first.outcome);
    expect([w.events.length, w.changes.length, w.version]).toEqual([events, changes, version]);
  });

  it("is not found for an unknown rule or a kind the command does not save", async () => {
    const w = world();
    w.dateRules = [{ ...rowFor("tonight"), payload: { version: 1, closeAt: 1300 } }];
    expect((await reopen(w)).outcome).toEqual({ kind: "not_found" });
    expect((await reopen(world(), MANAGER, "nope")).outcome).toEqual({ kind: "not_found" });
  });

  it("lets a Host reopen only the emergency close they made", async () => {
    const w = world({ hostEmergencyClose: true, reservations: [] });
    const tonight = closure({ startsOn: "2026-10-25", endsOn: "2026-10-25" });
    await run(w, body({ rule: tonight, decisions: [] }), { caller: HOST });
    w.dateRules = [
      {
        ...rowFor("closure"),
        startsOn: new Date("2026-10-25T00:00:00.000Z"),
        endsOn: new Date("2026-10-25T00:00:00.000Z"),
      },
    ];

    const other = await reopen(w, { isManager: false, actorId: "host-2" });
    expect(other.outcome).toEqual({ kind: "forbidden" });

    const author = await reopen(w, HOST);
    expect(author.outcome.kind).toBe("reopened");
  });
});

describe("createClosure for a Tonight close-early (#7529)", () => {
  const TONIGHT_KINDS = new Set(["tonight"]);
  const closeEarly = {
    id: "t-new",
    kind: "tonight",
    targetKind: "venue",
    startsOn: "2026-10-25",
    endsOn: "2026-10-25",
    payload: { version: 1, closeAt: 1260 },
    expiresAt: "2026-10-26T07:00:00.000Z",
  } as DateRule;
  const tonightWorld = () =>
    world({
      reservations: [
        res("res-t", "2026-10-25", "2026-10-26T04:30:00.000Z", "2026-10-26T06:00:00.000Z"),
      ],
    });
  const tonightBody = (patch: Partial<CreateClosureBody> = {}) =>
    body({
      rule: closeEarly,
      decisions: [{ groupKey: "2026-10-25:shortened", action: "cancel" }],
      ...patch,
    });
  const runTonight = async (w: World, b: CreateClosureBody, caller = MANAGER) => {
    const { client } = fakeClient(w);
    return createClosure(
      {
        venueId: "v",
        caller,
        body: b,
        idempotencyKey: "tonight:t-new",
        now: NOW,
        ruleKinds: TONIGHT_KINDS,
      },
      client
    );
  };

  it("lets a Host close early tonight, without the emergency grant, and cancels the late booking", async () => {
    const w = tonightWorld();
    const outcome = await runTonight(w, tonightBody(), HOST);

    expect(outcome).toMatchObject({ kind: "saved", result: { outcomes: { cancel: 1 } } });
    expect(w.reservations[0]!.status).toBe("CANCELLED");
    expect(w.events).toEqual([
      expect.objectContaining({ reservationId: "res-t", kind: "cancelled" }),
    ]);
    expect(w.changes[0]!.summary).toMatch(/^Closing early 2026-10-25/);
  });

  it("asks for a decision for the bookings after the new close", async () => {
    const w = tonightWorld();
    const outcome = await runTonight(w, tonightBody({ decisions: [] }), HOST);
    expect(outcome).toEqual({ kind: "decision_required", groupKeys: ["2026-10-25:shortened"] });
    expect(w.reservations[0]!.status).toBe("CONFIRMED");
  });

  it("refuses a Host a close-early dated another day", async () => {
    const other = { ...closeEarly, startsOn: "2026-10-27", endsOn: "2026-10-27" } as DateRule;
    const outcome = await runTonight(tonightWorld(), tonightBody({ rule: other }), HOST);
    expect(outcome).toEqual({ kind: "forbidden" });
  });

  describe("a close-early that removes the whole of tonight is the emergency close", () => {
    const at = (closeAt: number, patch: Partial<DateRule> = {}) =>
      ({ ...closeEarly, ...patch, payload: { version: 1, closeAt } }) as DateRule;
    const closed = [{ groupKey: "2026-10-25:shortened", action: "cancel" as const }];

    it.each([
      ["closeAt 0 for the venue", at(0)],
      ["a close before dinner opens", at(1000)],
      ["a close exactly at dinner's open", at(1020)],
      [
        "dinner's own close-early before it opens",
        at(1000, { targetKind: "service", venueServiceId: "vs-dinner" }),
      ],
    ])("refuses a Host without the grant: %s", async (_label, rule) => {
      const w = tonightWorld();
      const outcome = await runTonight(w, tonightBody({ rule, decisions: closed }), HOST);
      expect(outcome).toEqual({ kind: "forbidden" });
      expect(w.reservations[0]!.status).toBe("CONFIRMED");
      expect(w.changes).toEqual([]);
    });

    it("lets a Host with the grant close all of tonight early", async () => {
      const w = { ...tonightWorld(), hostEmergencyClose: true };
      const outcome = await runTonight(w, tonightBody({ rule: at(0), decisions: closed }), HOST);
      expect(outcome).toMatchObject({ kind: "saved", result: { outcomes: { cancel: 1 } } });
    });

    it("guards the impact preview the same way", async () => {
      const { client } = fakeClient(tonightWorld());
      expect(await mayClose("v", false, at(0), NOW, client)).toBe(false);
      expect(await mayClose("v", false, at(1260), NOW, client)).toBe(true);
      const granted = fakeClient({ ...tonightWorld(), hostEmergencyClose: true }).client;
      expect(await mayClose("v", false, at(0), NOW, granted)).toBe(true);
    });
  });

  it("is not a closure: POST /closures (default kinds) refuses a Tonight rule", async () => {
    const { outcome } = await run(tonightWorld(), tonightBody());
    expect(outcome).toMatchObject({ kind: "invalid", issues: [{ code: "unsupported_kind" }] });
  });
});
