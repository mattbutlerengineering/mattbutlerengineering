import { describe, expect, it, vi } from "vitest";
import { resolveDay } from "@mbe/availability";
import type { SetTonightBody } from "@mbe/types";

vi.mock("./database.js", () => ({ prisma: {} }));

const { setTonight, endTonight } = await import("./tonight-command.js");
const { getAvailabilityConfig } = await import("./availability-config.js");
const { currentServiceDate } = await import("./closure-command-plan.js");

const NOW = new Date("2026-10-25T19:00:00.000Z"); // Sun Oct 25, noon in Los Angeles
const TZ = "America/Los_Angeles";
const TODAY = "2026-10-25";
const MIDNIGHT_AFTER = "2026-10-26T07:00:00.000Z"; // end of Sunday's service day (PDT)
const HOST = { isManager: false, actorId: "host-1" };
const MANAGER = { isManager: true, actorId: "mgr-1" };

interface World {
  version: number;
  hostEmergencyClose: boolean;
  /** The channels the dinner service takes bookings on. */
  bookingTypes: string[];
  dateRules: Record<string, unknown>[];
  ruleTables: { dateRuleId: string; tableId: string }[];
  changes: { id: string; actorId: string; kind: string; summary: string; inverse: unknown }[];
  /** Counts writes to the schedule tables: Tonight must never touch them. */
  scheduleWrites: number;
}

const world = (): World => ({
  version: 4,
  hostEmergencyClose: false,
  bookingTypes: ["online", "phone"],
  dateRules: [],
  ruleTables: [],
  changes: [],
  scheduleWrites: 0,
});

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
      create: vi.fn(async () => void w.scheduleWrites++),
      update: vi.fn(async () => void w.scheduleWrites++),
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
          bookingTypes: w.bookingTypes,
        },
      ]),
      create: vi.fn(async () => void w.scheduleWrites++),
      update: vi.fn(async () => void w.scheduleWrites++),
      deleteMany: vi.fn(async () => void w.scheduleWrites++),
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
      create: vi.fn(async () => void w.scheduleWrites++),
      update: vi.fn(async () => void w.scheduleWrites++),
      deleteMany: vi.fn(async () => void w.scheduleWrites++),
    },
    dateRule: {
      findMany: vi.fn(async () =>
        w.dateRules.map((r) => ({
          ...r,
          tables: w.ruleTables
            .filter((t) => t.dateRuleId === r["id"])
            .map((t) => ({ tableId: t.tableId })),
        }))
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        // Prisma.DbNull stands for SQL NULL on write; the table reads it back as null.
        w.dateRules = [...w.dateRules, { deletedAt: null, ...data, repeat: null, window: null }];
      }),
      updateMany: vi.fn(
        async ({ where, data }: { where: { id: { in: string[] } }; data: object }) => {
          w.dateRules = w.dateRules.filter((r) => !where.id.in.includes(r["id"] as string));
          void data;
          return { count: 1 };
        }
      ),
      update: vi.fn(async () => ({})),
    },
    dateRuleTable: {
      createMany: vi.fn(async ({ data }: { data: { dateRuleId: string; tableId: string }[] }) => {
        w.ruleTables = [...w.ruleTables, ...data];
      }),
      deleteMany: vi.fn(async () => ({})),
    },
    venue: {
      findUnique: vi.fn(async (_input: Record<string, unknown>) => ({
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
        if (data?.availabilityVersion) w.version += 1;
        return { availabilityVersion: w.version };
      }),
    },
    table: {
      findMany: vi.fn(async ({ where }: { where?: { isActive?: boolean } } = {}) =>
        [
          { id: "t-1", isActive: true },
          { id: "t-2", isActive: true },
          { id: "t-3", isActive: false },
        ].filter((t) => where?.isActive === undefined || t.isActive === where.isActive)
      ),
    },
    availabilityChange: {
      findFirst: vi.fn(async ({ where }: { where: { inverse?: { equals: unknown } } }) => {
        const wanted = where.inverse?.equals;
        if (wanted === undefined) return w.changes.at(-1) ?? null;
        return (
          w.changes.find(
            (c) => (c.inverse as { tonight?: { ruleId: string } }).tonight?.ruleId === wanted
          ) ?? null
        );
      }),
      count: vi.fn(async () => w.changes.length),
      create: vi.fn(async ({ data }: { data: World["changes"][number] }) => {
        const change = { ...data, id: `chg-${w.changes.length + 1}` };
        w.changes = [...w.changes, change];
        return { id: change.id };
      }),
    },
  };
  const client = {
    $transaction: vi.fn(async (work: (t: unknown) => Promise<unknown>) => {
      const snapshot = { ...w };
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

const body = (change: SetTonightBody["change"], patch: Partial<SetTonightBody> = {}) =>
  ({ expectedVersion: 4, ruleId: "t-new", change, decisions: [], ...patch }) as SetTonightBody;

const run = (
  w: World,
  b: SetTonightBody,
  opts: { caller?: typeof HOST; now?: Date; createClosure?: ReturnType<typeof vi.fn> } = {}
) => {
  const { client } = fakeClient(w);
  return setTonight(
    { venueId: "v", caller: opts.caller ?? HOST, body: b, now: opts.now ?? NOW },
    client,
    { createClosure: (opts.createClosure ?? vi.fn()) as never }
  );
};

describe("setTonight", () => {
  it("pauses online booking as a whole-day stop on the online channel, ending at the service-day boundary", async () => {
    const w = world();
    const outcome = await run(w, body({ type: "pause_online" }));

    expect(outcome).toMatchObject({
      kind: "saved",
      result: {
        ruleId: "t-new",
        version: 5,
        serviceDate: TODAY,
        expiresAt: MIDNIGHT_AFTER,
        outcomes: { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 },
      },
    });
    expect(w.dateRules).toHaveLength(1);
    expect(w.dateRules[0]).toMatchObject({
      id: "t-new",
      kind: "tonight",
      source: "tonight",
      targetKind: "booking",
      bookingTypes: ["online"],
      payload: { version: 1, stop: { from: 0, to: 2880 } },
      expiresAt: new Date(MIDNIGHT_AFTER),
      createdBy: "host-1",
    });
    expect(w.changes[0]).toMatchObject({ kind: "tonight", actorId: "host-1" });
  });

  it("blocks tables for the rest of tonight through DateRuleTable", async () => {
    const w = world();
    const outcome = await run(w, body({ type: "block_tables", tableIds: ["t-1", "t-2"] }), {
      caller: MANAGER,
    });

    expect(outcome.kind).toBe("saved");
    expect(w.dateRules[0]).toMatchObject({
      targetKind: "tables",
      payload: { version: 1, stop: { from: 0, to: 2880 } },
    });
    expect(w.ruleTables).toEqual([
      { dateRuleId: "t-new", tableId: "t-1", venueId: "v" },
      { dateRuleId: "t-new", tableId: "t-2", venueId: "v" },
    ]);
  });

  it("refuses a table block naming a table the venue does not have", async () => {
    const w = world();
    const outcome = await run(w, body({ type: "block_tables", tableIds: ["t-1", "other"] }));

    expect(outcome).toMatchObject({
      kind: "invalid",
      issues: [expect.objectContaining({ code: "unknown_reference" })],
    });
    expect(w.dateRules).toEqual([]);
    expect(w.version).toBe(4);
  });

  it("writes a stop window and a pacing change as venue-wide Tonight rules", async () => {
    const w = world();
    await run(w, body({ type: "stop_window", from: 1170, to: 1200 }));
    await run(w, body({ type: "pacing", covers: 12 }, { expectedVersion: 5, ruleId: "t-2" }));

    expect(w.dateRules.map((r) => [r["targetKind"], r["payload"]])).toEqual([
      ["venue", { version: 1, stop: { from: 1170, to: 1200 } }],
      ["venue", { version: 1, pacing: { covers: 12 } }],
    ]);
  });

  describe("a stop window over the rest of the service is the emergency close (#7687)", () => {
    const wholeNight = body({ type: "stop_window", from: 1020, to: 1440 });

    it("refuses a Host without the grant and writes nothing", async () => {
      const w = world();
      expect(await run(w, wholeNight)).toEqual({ kind: "forbidden" });
      expect(w.dateRules).toEqual([]);
      expect(w.version).toBe(4);
    });

    it("refuses a Host a stop over what is left of the service, mid-service", async () => {
      const w = world();
      const midService = new Date("2026-10-26T01:30:00.000Z"); // 18:30 in Los Angeles
      const rest = body({ type: "stop_window", from: 1100, to: 1440 });
      expect(await run(w, rest, { now: midService })).toEqual({ kind: "forbidden" });
    });

    it("lets a Host with the grant, and a Manager, through the permission check", async () => {
      const granted = { ...world(), hostEmergencyClose: true };
      expect((await run(granted, wholeNight)).kind).toBe("saved");
      expect((await run(world(), wholeNight, { caller: MANAGER })).kind).toBe("saved");
    });

    it("answers a Host's retry of a saved stop with the replay, even once it covers the rest of the night", async () => {
      const w = world();
      const stop = body({ type: "stop_window", from: 1100, to: 1440 });
      const first = await run(w, stop); // noon: seatings until 18:15 remain, so it is allowed
      expect(first.kind).toBe("saved");
      const later = new Date("2026-10-26T01:31:00.000Z"); // 18:31 in Los Angeles
      const retry = await run(w, { ...stop, expectedVersion: 5 }, { now: later });
      expect(retry).toMatchObject({ kind: "saved", result: { ruleId: "t-new" } });
      expect(w.dateRules).toHaveLength(1);
    });

    it("still lets a Host stop a window that leaves the service bookable", async () => {
      const w = world();
      expect((await run(w, body({ type: "stop_window", from: 1170, to: 1200 }))).kind).toBe(
        "saved"
      );
    });
  });

  describe("a table block or online pause that leaves nothing bookable is the emergency close (#7721)", () => {
    const allTables = body({ type: "block_tables", tableIds: ["t-1", "t-2"] });

    it("refuses a Host blocking every table and writes nothing", async () => {
      const w = world();
      expect(await run(w, allTables)).toEqual({ kind: "forbidden" });
      expect(w.dateRules).toEqual([]);
      expect(w.version).toBe(4);
    });

    it("ignores an inactive table: blocking every active table is still the close", async () => {
      // t-3 is inactive, so the engine never seats it and it cannot keep the night open.
      expect(await run(world(), allTables)).toEqual({ kind: "forbidden" });
    });

    it("refuses a Host whose second block leaves no table, however it is split", async () => {
      const w = world();
      const first = await run(w, body({ type: "block_tables", tableIds: ["t-1"] }));
      expect(first.kind).toBe("saved");
      const second = body(
        { type: "block_tables", tableIds: ["t-2"] },
        { expectedVersion: 5, ruleId: "t-2" }
      );
      expect(await run(w, second)).toEqual({ kind: "forbidden" });
      expect(w.dateRules).toHaveLength(1);
    });

    it("refuses a Host pausing online on an online-only service", async () => {
      const w = { ...world(), bookingTypes: ["online"] };
      expect(await run(w, body({ type: "pause_online" }))).toEqual({ kind: "forbidden" });
      expect(w.dateRules).toEqual([]);
    });

    it("lets a Host block some tables", async () => {
      const w = world();
      expect((await run(w, body({ type: "block_tables", tableIds: ["t-1"] }))).kind).toBe("saved");
    });

    it("lets a Host pause online while phone stays open", async () => {
      expect((await run(world(), body({ type: "pause_online" }))).kind).toBe("saved");
    });

    it("lets a Manager, and a Host with the grant, block every table", async () => {
      expect((await run(world(), allTables, { caller: MANAGER })).kind).toBe("saved");
      const granted = { ...world(), hostEmergencyClose: true };
      expect((await run(granted, allTables)).kind).toBe("saved");
    });
  });

  it("refuses a stop window that ends before it starts", async () => {
    const outcome = await run(world(), body({ type: "stop_window", from: 1200, to: 1170 }));
    expect(outcome).toMatchObject({ kind: "invalid" });
  });

  it("refuses a stale version without writing", async () => {
    const w = world();
    const outcome = await run(w, body({ type: "pause_online" }, { expectedVersion: 3 }));
    expect(outcome.kind).toBe("version_conflict");
    expect(w.dateRules).toEqual([]);
  });

  it("answers a retry of the same ruleId with the first result and writes nothing more", async () => {
    const w = world();
    const first = await run(w, body({ type: "pause_online" }));
    const again = await run(w, body({ type: "pause_online" }, { expectedVersion: 4 }));

    expect(again).toEqual(first);
    expect(w.dateRules).toHaveLength(1);
    expect(w.version).toBe(5);
  });

  it("refuses an id that already names a different Tonight change", async () => {
    const w = world();
    await run(w, body({ type: "pause_online" }));
    const outcome = await run(w, body({ type: "pacing", covers: 8 }, { expectedVersion: 5 }));
    expect(outcome.kind).toBe("rule_exists");
  });

  it("routes a close-early through the closure command, as tonight's date, keyed by the ruleId and the change", async () => {
    const w = world();
    const createClosure = vi.fn(async (_input: Record<string, unknown>) => ({
      kind: "saved",
      result: {
        ruleId: "t-new",
        version: 5,
        changeId: "chg-9",
        outcomes: { cancel: 2, move: 0, keep_notify: 0, keep_silent: 0 },
      },
    }));
    const decisions = [{ groupKey: `${TODAY}:shortened`, action: "cancel" as const }];

    const outcome = await run(w, body({ type: "close_early", closeAt: 1260 }, { decisions }), {
      createClosure,
    });

    expect(outcome).toMatchObject({
      kind: "saved",
      result: { changeId: "chg-9", serviceDate: TODAY, expiresAt: MIDNIGHT_AFTER },
    });
    const call = createClosure.mock.calls[0]![0];
    expect(call).toMatchObject({
      venueId: "v",
      caller: HOST,
      idempotencyKey: expect.stringMatching(/^tonight:t-new:[0-9a-f]{16}$/),
      body: {
        expectedVersion: 4,
        decisions,
        rule: {
          id: "t-new",
          kind: "tonight",
          targetKind: "venue",
          startsOn: TODAY,
          endsOn: TODAY,
          payload: { version: 1, closeAt: 1260 },
          expiresAt: MIDNIGHT_AFTER,
        },
      },
    });
    expect((call["ruleKinds"] as Set<string>).has("tonight")).toBe(true);
    expect(w.dateRules).toEqual([]); // the closure command owns the write
  });

  it("targets one service when the close-early names it", async () => {
    const createClosure = vi.fn(async (_input: Record<string, unknown>) => ({ kind: "forbidden" }));
    await run(world(), body({ type: "close_early", closeAt: 1260, venueServiceId: "vs-dinner" }), {
      createClosure,
    });
    expect(createClosure.mock.calls[0]![0]).toMatchObject({
      body: { rule: { targetKind: "service", venueServiceId: "vs-dinner" } },
    });
  });

  describe("a close-early retried under the same ruleId", () => {
    const storedCloseEarly = (closeAt: number) => ({
      id: "t-new",
      kind: "tonight",
      source: "tonight",
      targetKind: "venue",
      venueServiceId: null,
      useScheduleId: null,
      bookingTypes: [],
      startsOn: new Date(`${TODAY}T00:00:00.000Z`),
      endsOn: new Date(`${TODAY}T00:00:00.000Z`),
      repeat: null,
      window: null,
      payload: { version: 1, closeAt },
      seriesId: null,
      guestMessage: null,
      staffNote: null,
      expiresAt: new Date(MIDNIGHT_AFTER),
      deletedAt: null,
    });
    const saved = () =>
      vi.fn(async (_input: Record<string, unknown>) => ({
        kind: "saved",
        result: { ruleId: "t-new", version: 5, changeId: "chg-1", outcomes: ZERO },
      }));
    const ZERO = { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 };

    it("refuses a different closeAt as an id clash (409 closure-exists), not a replay", async () => {
      const w = world();
      w.dateRules = [storedCloseEarly(1260)];
      const createClosure = saved();
      const outcome = await run(w, body({ type: "close_early", closeAt: 1200 }), {
        createClosure,
      });
      expect(outcome).toEqual({ kind: "rule_exists" });
      expect(createClosure).not.toHaveBeenCalled();
    });

    it("hands the same change to the closure command to replay", async () => {
      const w = world();
      w.dateRules = [storedCloseEarly(1260)];
      const createClosure = saved();
      const outcome = await run(w, body({ type: "close_early", closeAt: 1260 }), {
        createClosure,
      });
      expect(outcome.kind).toBe("saved");
      expect(createClosure).toHaveBeenCalledTimes(1);
    });

    it("keys the closure command by the change, so an ended close-early never replays a different one", async () => {
      const createClosure = saved();
      await run(world(), body({ type: "close_early", closeAt: 1260 }), { createClosure });
      await run(world(), body({ type: "close_early", closeAt: 1260 }), { createClosure });
      await run(world(), body({ type: "close_early", closeAt: 1200 }), { createClosure });
      const keys = createClosure.mock.calls.map((c) => c[0]!["idempotencyKey"] as string);
      expect(keys[0]).toBe(keys[1]);
      expect(keys[2]).not.toBe(keys[0]);
      expect(keys.every((k) => k.startsWith("tonight:t-new:"))).toBe(true);
    });
  });

  it("passes the closure command's refusals through", async () => {
    const createClosure = vi.fn(async (_input: Record<string, unknown>) => ({
      kind: "decision_required",
      groupKeys: [`${TODAY}:shortened`],
    }));
    const outcome = await run(world(), body({ type: "close_early", closeAt: 1260 }), {
      createClosure,
    });
    expect(outcome).toEqual({ kind: "decision_required", groupKeys: [`${TODAY}:shortened`] });
  });

  it("answers an unknown venue with not_found", async () => {
    const w = world();
    const { client, tx } = fakeClient(w);
    tx.venue.findUnique.mockResolvedValue(null as never);
    const outcome = await setTonight(
      { venueId: "v", caller: HOST, body: body({ type: "pause_online" }), now: NOW },
      client,
      { createClosure: vi.fn() as never }
    );
    expect(outcome.kind).toBe("not_found");
  });
});

describe("Tonight pause_online and the day summary", () => {
  it("turns bookingOpen.online off for tonight and leaves phone and waitlist open", async () => {
    const w = world();
    const outcome = await run(w, body({ type: "pause_online" }));
    expect(outcome.kind).toBe("saved");
    const { client } = fakeClient(w);
    const config = (await getAvailabilityConfig("v", NOW, client))!.config;

    const tonight = resolveDay({ timezone: TZ, config }, TODAY);
    expect(tonight.bookingOpen).toEqual({ online: false, phone: true, waitlist: true });
  });
});

describe("Tonight at the service-day boundary (SC Night-of expiry)", () => {
  it("is gone the next service day, with schedules untouched", async () => {
    const w = world();
    const changes: SetTonightBody["change"][] = [
      { type: "pause_online" },
      { type: "stop_window", from: 1170, to: 1200 },
      { type: "block_tables", tableIds: ["t-1"] },
      { type: "pacing", covers: 10 },
    ];
    for (const [i, change] of changes.entries()) {
      const outcome = await run(w, body(change, { expectedVersion: 4 + i, ruleId: `t-${i}` }));
      expect(outcome.kind).toBe("saved");
    }
    const { client } = fakeClient(w);
    const config = (await getAvailabilityConfig("v", NOW, client))!.config;
    const snapshot = { timezone: TZ, config };

    const tonight = resolveDay(snapshot, TODAY);
    expect(tonight.closures).toHaveLength(3);
    expect(tonight.pacingCovers).toBe(10);
    expect(tonight.services).toHaveLength(1);

    const afterBoundary = new Date(MIDNIGHT_AFTER);
    const nextDay = currentServiceDate(snapshot, new Date(afterBoundary.getTime() + 60_000));
    expect(nextDay).toBe("2026-10-26");
    const tomorrow = resolveDay(snapshot, nextDay);
    expect(tomorrow.closures).toEqual([]);
    expect(tomorrow.pacingCovers).toBeUndefined();
    expect(tomorrow.bookingOpen).toEqual({ online: true, phone: true, waitlist: true });
    expect(tomorrow.services).toEqual(resolveDay(snapshot, "2026-10-19").services);
    expect(w.scheduleWrites).toBe(0);
  });
});

describe("endTonight", () => {
  it("ends a Tonight change and bumps the version", async () => {
    const w = world();
    await run(w, body({ type: "pause_online" }));
    const { client } = fakeClient(w);

    const outcome = await endTonight(
      { venueId: "v", ruleId: "t-new", caller: HOST, now: NOW },
      client
    );

    expect(outcome).toMatchObject({ kind: "ended", result: { version: 6 } });
    expect(w.dateRules).toEqual([]);
    expect(w.changes.at(-1)).toMatchObject({ kind: "tonight_end", actorId: "host-1" });
  });

  it("does not find a rule that is not a Tonight change", async () => {
    const w = world();
    w.dateRules = [
      {
        id: "dr-1",
        kind: "closure",
        targetKind: "venue",
        venueServiceId: null,
        bookingTypes: [],
        startsOn: new Date("2026-12-24T00:00:00.000Z"),
        endsOn: new Date("2026-12-24T00:00:00.000Z"),
        repeat: null,
        window: null,
        payload: {},
        seriesId: null,
        guestMessage: null,
        staffNote: null,
        expiresAt: null,
        deletedAt: null,
      },
    ];
    const { client } = fakeClient(w);

    const outcome = await endTonight(
      { venueId: "v", ruleId: "dr-1", caller: MANAGER, now: NOW },
      client
    );

    expect(outcome.kind).toBe("not_found");
    expect(w.dateRules).toHaveLength(1);
  });
});
