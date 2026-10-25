import { describe, expect, it, vi } from "vitest";
import type { CreateClosureBody, DateRule } from "@mbe/types";

vi.mock("./database.js", () => ({ prisma: {} }));

const { createClosure, reopenClosure, mayClose } = await import("./closure-command.js");

const NOW = new Date("2026-10-25T19:00:00.000Z"); // Sun Oct 25, noon in Los Angeles
const TZ = "America/Los_Angeles";
const MANAGER = { isManager: true, actorId: "user-1" };
const HOST = { isManager: false, actorId: "host-1" };

const res = (id: string, date: string, startIso: string, endIso: string, deposit = true) => ({
  id,
  tableId: "t-1",
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
  reservations: ReturnType<typeof res>[];
  dateRules: Record<string, unknown>[];
  changes: { id: string; inverse: unknown; kind: string; notifiedGuests: boolean }[];
  outcomes: Record<string, unknown>[];
  /** Reservation ids the transition port has already cancelled. */
  cancelled: Set<string>;
}

function world(patch: Partial<World> = {}): World {
  return {
    version: 4,
    hostEmergencyClose: false,
    reservations: [
      res("res-1", "2026-12-24", "2026-12-25T03:00:00.000Z", "2026-12-25T04:30:00.000Z"),
      res("res-2", "2026-12-24", "2026-12-25T03:30:00.000Z", "2026-12-25T05:00:00.000Z", false),
    ],
    dateRules: [],
    changes: [],
    outcomes: [],
    cancelled: new Set(),
    ...patch,
  };
}

/** A client whose transactions read and write one in-memory world. */
function fakeClient(w: World) {
  const tx = {
    $executeRaw: vi.fn(async () => 0),
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
          opensAt: 1020,
          lastSeatingAt: 1260,
          closesAt: 1380,
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
        w.dateRules = [...w.dateRules, { venueId: "v", deletedAt: null, ...data }];
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
      update: vi.fn(async () => {
        return { availabilityVersion: w.version };
      }),
    },
    table: { findMany: vi.fn(async () => [{ id: "t-1" }]) },
    reservation: { findMany: vi.fn(async () => w.reservations) },
    availabilityChange: {
      findFirst: vi.fn(async ({ where }: { where: { inverse?: { equals?: string } } }) => {
        const key = where.inverse?.equals;
        if (key === undefined) return w.changes.at(-1) ?? null;
        return (
          w.changes.find(
            (c) =>
              (c.inverse as { closure?: { idempotencyKey?: string } }).closure?.idempotencyKey ===
              key
          ) ?? null
        );
      }),
      create: vi.fn(
        async ({ data }: { data: { inverse: unknown; kind: string; notifiedGuests: boolean } }) => {
          const change = { id: `chg-${w.changes.length + 1}`, ...data };
          w.changes = [...w.changes, change];
          return { id: change.id };
        }
      ),
    },
    closureOutcome: {
      createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
        w.outcomes = [
          ...w.outcomes,
          ...data.map((d, i) => ({ id: `o-${w.outcomes.length + i}`, ...d })),
        ];
      }),
      findMany: vi.fn(async () =>
        w.outcomes.map((o) => {
          const r = w.reservations.find((x) => x.id === o.reservationId)!;
          return {
            ...o,
            reservation: {
              status: w.cancelled.has(r.id) ? "CANCELLED" : "CONFIRMED",
              startTime: r.startTime,
              endTime: r.endTime,
            },
          };
        })
      ),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
  const client = {
    $transaction: vi.fn(async (work: (t: unknown) => Promise<unknown>) => {
      const snapshot = { ...w, dateRules: w.dateRules, changes: w.changes, outcomes: w.outcomes };
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

function transitions(w: World) {
  return {
    cancel: vi.fn(async (id: string) => {
      w.cancelled.add(id);
      return { ok: true as const };
    }),
    move: vi.fn(async () => ({ ok: true as const })),
  };
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

const run = (
  w: World,
  b: CreateClosureBody,
  opts: { key?: string; caller?: typeof MANAGER; t?: ReturnType<typeof transitions> } = {}
) => {
  const { client, tx } = fakeClient(w);
  const t = opts.t ?? transitions(w);
  return createClosure(
    {
      venueId: "v",
      caller: opts.caller ?? MANAGER,
      body: b,
      idempotencyKey: opts.key ?? "key-1",
      now: NOW,
    },
    t,
    client
  ).then((outcome) => ({ outcome, tx, t }));
};

describe("createClosure", () => {
  it("cancels the group through the transition, recording a pending refund for a held deposit", async () => {
    const w = world();
    const { outcome, tx, t } = await run(w, body());

    expect(outcome).toMatchObject({
      kind: "saved",
      result: {
        ruleId: "dr-new",
        version: 5,
        outcomes: { cancel: 2, move: 0, keep_notify: 0, keep_silent: 0 },
        unapplied: [],
      },
    });
    expect(t.cancel).toHaveBeenCalledTimes(2);
    const rows = tx.closureOutcome.createMany.mock.calls[0]![0].data;
    expect(rows).toEqual([
      expect.objectContaining({ reservationId: "res-1", action: "cancel", refund: "pending" }),
      expect.objectContaining({ reservationId: "res-2", action: "cancel", refund: "none" }),
    ]);
    expect(w.dateRules).toHaveLength(1);
    expect(w.changes[0]).toMatchObject({ kind: "closure", notifiedGuests: true });
  });

  it("keeps and notifies without touching the reservations", async () => {
    const w = world();
    const { outcome, t } = await run(
      w,
      body({ decisions: [{ groupKey: "2026-12-24:closed", action: "keep_notify" }] })
    );
    expect(outcome).toMatchObject({ kind: "saved", result: { outcomes: { keep_notify: 2 } } });
    expect(t.cancel).not.toHaveBeenCalled();
    expect(t.move).not.toHaveBeenCalled();
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

  it("moves a shortened group to the nearest open time", async () => {
    const shortened = {
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
    const w = world({
      reservations: [
        res("res-1", "2026-12-24", "2026-12-25T03:00:00.000Z", "2026-12-25T04:30:00.000Z"),
      ],
    });
    const { outcome, tx, t } = await run(
      w,
      body({ rule: shortened, decisions: [{ groupKey: "2026-12-24:shortened", action: "move" }] })
    );

    expect(outcome).toMatchObject({ kind: "saved", result: { outcomes: { move: 1 } } });
    expect(tx.closureOutcome.createMany.mock.calls[0]![0].data[0]).toMatchObject({
      action: "move",
      movedTo: new Date("2026-12-25T02:00:00.000Z"), // 6:00 PM in Los Angeles
    });
    expect(t.move).toHaveBeenCalledWith("res-1", {
      startTime: new Date("2026-12-25T02:00:00.000Z"),
      endTime: new Date("2026-12-25T03:30:00.000Z"),
    });
  });

  it("refuses a move on a closed day", async () => {
    const { outcome } = await run(
      world(),
      body({ decisions: [{ groupKey: "2026-12-24:closed", action: "move" }] })
    );
    expect(outcome).toEqual({ kind: "invalid_decision", groupKeys: ["2026-12-24:closed"] });
  });

  it("handles mixed groups, one decision each", async () => {
    const w = world({
      reservations: [
        res("res-1", "2026-12-24", "2026-12-25T03:00:00.000Z", "2026-12-25T04:30:00.000Z"),
        res("res-3", "2026-12-25", "2026-12-26T03:00:00.000Z", "2026-12-26T04:30:00.000Z"),
      ],
    });
    const { outcome, t } = await run(
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
    expect(t.cancel).toHaveBeenCalledTimes(1);
    expect(t.cancel).toHaveBeenCalledWith("res-1");
  });

  it("leaves no active reservation under the closure unless its outcome is keep", async () => {
    const w = world({
      reservations: [
        res("res-1", "2026-12-24", "2026-12-25T03:00:00.000Z", "2026-12-25T04:30:00.000Z"),
        res("res-3", "2026-12-25", "2026-12-26T03:00:00.000Z", "2026-12-26T04:30:00.000Z"),
      ],
    });
    await run(
      w,
      body({
        rule: closure({ endsOn: "2026-12-25" }),
        decisions: [
          { groupKey: "2026-12-24:closed", action: "cancel" },
          { groupKey: "2026-12-25:closed", action: "keep_notify" },
        ],
      })
    );

    expect(w.outcomes).toHaveLength(w.reservations.length);
    for (const o of w.outcomes) {
      const active = !w.cancelled.has(o.reservationId as string);
      expect(!active || String(o.action).startsWith("keep_")).toBe(true);
    }
  });

  it("saves nothing when a group has no decision", async () => {
    const w = world();
    const { outcome } = await run(w, body({ decisions: [] }));
    expect(outcome).toEqual({ kind: "decision_required", groupKeys: ["2026-12-24:closed"] });
    expect(w.version).toBe(4);
    expect(w.dateRules).toHaveLength(0);
    expect(w.outcomes).toHaveLength(0);
  });

  it("replays the same key to the first result without cancelling twice", async () => {
    const w = world();
    const first = await run(w, body());
    const second = await run(w, body());

    expect(second.outcome).toEqual(first.outcome);
    expect(w.version).toBe(5);
    expect(w.dateRules).toHaveLength(1);
    expect(w.outcomes).toHaveLength(2);
    expect(second.t.cancel).not.toHaveBeenCalled();
  });

  it("finishes a cancel that failed the first time when the key is replayed", async () => {
    const w = world();
    const flaky = {
      cancel: vi.fn(async (id: string) => {
        if (id === "res-1") return { ok: false as const, reason: "Stripe unavailable" };
        w.cancelled.add(id);
        return { ok: true as const };
      }),
      move: vi.fn(),
    };
    const first = await run(w, body(), { t: flaky as never });
    expect(first.outcome).toMatchObject({
      result: {
        unapplied: [{ reservationId: "res-1", action: "cancel", reason: "Stripe unavailable" }],
      },
    });

    const second = await run(w, body());
    expect(second.outcome).toMatchObject({ result: { unapplied: [] } });
    expect(second.t.cancel).toHaveBeenCalledTimes(1);
    expect(second.t.cancel).toHaveBeenCalledWith("res-1");
  });

  it("refuses a key reused for a different closure", async () => {
    const w = world();
    await run(w, body());
    const { outcome } = await run(w, body({ rule: closure({ id: "dr-other" }) }));
    expect(outcome).toEqual({ kind: "key_reused" });
  });

  it("answers a stale version with the winning change", async () => {
    const w = world({ version: 7 });
    const { outcome } = await run(w, body({ expectedVersion: 4 }));
    expect(outcome.kind).toBe("version_conflict");
    expect(w.dateRules).toHaveLength(0);
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
  it("soft-deletes the rule and bumps the version, leaving cancelled guests cancelled", async () => {
    const w = world();
    const saved = await run(w, body());
    expect(saved.outcome.kind).toBe("saved");
    // The in-memory dateRule row, as the reader maps it back.
    w.dateRules = [
      {
        id: "dr-new",
        venueId: "v",
        kind: "closure",
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
      },
    ];
    const { client, tx } = fakeClient(w);

    const outcome = await reopenClosure(
      { venueId: "v", ruleId: "dr-new", caller: MANAGER, tellCancelledGuests: true, now: NOW },
      client
    );

    expect(outcome).toMatchObject({ kind: "reopened", result: { changeId: expect.any(String) } });
    expect(tx.dateRule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deletedAt: NOW } })
    );
    expect(w.cancelled.size).toBe(2);
    expect(w.changes.at(-1)).toMatchObject({ kind: "reopen", notifiedGuests: true });
  });

  it("is not found for an unknown rule", async () => {
    const { client } = fakeClient(world());
    const outcome = await reopenClosure(
      { venueId: "v", ruleId: "nope", caller: MANAGER, tellCancelledGuests: false, now: NOW },
      client
    );
    expect(outcome).toEqual({ kind: "not_found" });
  });
});
