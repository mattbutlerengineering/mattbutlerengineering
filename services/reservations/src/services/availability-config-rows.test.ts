import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../generated/prisma/index.js";
import type { ConfigDiff } from "./availability-config-plan.js";

const { parseConfigRows } = vi.hoisted(() => ({ parseConfigRows: vi.fn() }));
vi.mock("./availability-snapshot.js", () => ({ parseConfigRows }));

import {
  ConfigRowConflict,
  readStoredConfig,
  writeConfigDiff,
  type ConfigRowDb,
} from "./availability-config-rows.js";

const calls: string[] = [];
const op = (name: string) => vi.fn(async (..._args: unknown[]) => void calls.push(name));

function makeDb() {
  const db = {
    schedule: { findMany: vi.fn(), create: op("schedule.create"), update: op("schedule.update") },
    venueService: {
      findMany: vi.fn(),
      create: op("venueService.create"),
      update: op("venueService.update"),
    },
    scheduleService: {
      findMany: vi.fn(),
      create: op("scheduleService.create"),
      update: op("scheduleService.update"),
      deleteMany: op("scheduleService.deleteMany"),
    },
    scheduleAssignment: {
      findMany: vi.fn(),
      create: op("assignment.create"),
      update: op("assignment.update"),
      deleteMany: op("assignment.deleteMany"),
    },
    dateRule: {
      findMany: vi.fn(),
      create: op("dateRule.create"),
      update: op("dateRule.update"),
      updateMany: op("dateRule.updateMany"),
    },
    dateRuleTable: {
      createMany: op("dateRuleTable.createMany"),
      deleteMany: op("dateRuleTable.deleteMany"),
    },
  };
  return db;
}

type Db = ReturnType<typeof makeDb>;
const asDb = (db: Db) => db as unknown as ConfigRowDb;

const emptyDiff = (): ConfigDiff => ({
  create: {
    schedules: [],
    venueServices: [],
    scheduleServices: [],
    assignments: [],
    dateRules: [],
  },
  update: {
    schedules: [],
    venueServices: [],
    scheduleServices: [],
    assignments: [],
    dateRules: [],
  },
  remove: {
    schedules: [],
    venueServices: [],
    scheduleServices: [],
    assignments: [],
    dateRules: [],
  },
});

const sched = (id: string, isRegular: boolean) =>
  ({ id, name: id, kind: "weekly", isRegular, archivedAt: null }) as never;
const vsvc = (id: string) => ({ id, name: id, position: 1, archivedAt: null }) as never;
const ssvc = (id: string) =>
  ({
    id,
    scheduleId: "s",
    venueServiceId: "v",
    opensAt: "17:00",
    lastSeatingAt: "21:00",
    closesAt: "23:00",
    seating: { a: 1 },
    bookingTypes: [],
  }) as never;
const asg = (id: string) =>
  ({ id, scheduleId: "s", weekdays: [1], startsOn: null, endsOn: null, precedence: 0 }) as never;
const rule = (id: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    kind: "closed",
    targetKind: "venue",
    startsOn: "2026-11-01",
    endsOn: null,
    repeat: null,
    window: null,
    tableIds: [],
    ...extra,
  }) as never;

const ctx = { actorId: "actor-1", now: new Date("2026-10-27T12:00:00.000Z") };

beforeEach(() => {
  calls.length = 0;
  parseConfigRows.mockReset();
});

describe("readStoredConfig", () => {
  it("reads all five tables scoped to the venue and composes them for parseConfigRows", async () => {
    const db = makeDb();
    db.schedule.findMany.mockResolvedValue(["sch"]);
    db.venueService.findMany.mockResolvedValue(["vs"]);
    db.scheduleService.findMany.mockResolvedValue(["ss"]);
    db.scheduleAssignment.findMany.mockResolvedValue(["as"]);
    db.dateRule.findMany.mockResolvedValue(["dr"]);
    parseConfigRows.mockImplementation((_rows: unknown, warnings: unknown[]) => {
      warnings.push({ code: "w" });
      return { parsed: true };
    });

    const result = await readStoredConfig(asDb(db), "venue-1");

    expect(db.schedule.findMany).toHaveBeenCalledWith({ where: { venueId: "venue-1" } });
    expect(db.venueService.findMany).toHaveBeenCalledWith({
      where: { venueId: "venue-1" },
      orderBy: { position: "asc" },
    });
    expect(db.scheduleService.findMany).toHaveBeenCalledWith({ where: { venueId: "venue-1" } });
    expect(db.scheduleAssignment.findMany).toHaveBeenCalledWith({ where: { venueId: "venue-1" } });
    expect(db.dateRule.findMany).toHaveBeenCalledWith({
      where: { venueId: "venue-1", deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: { tables: { select: { tableId: true } } },
    });
    expect(parseConfigRows).toHaveBeenCalledWith(
      {
        schedules: ["sch"],
        venueServices: ["vs"],
        scheduleServices: ["ss"],
        assignments: ["as"],
        dateRules: ["dr"],
      },
      expect.any(Array)
    );
    expect(result).toEqual({ config: { parsed: true }, warnings: [{ code: "w" }] });
  });
});

describe("writeConfigDiff ordering", () => {
  it("runs updates, removals, creates, then remaining updates, in that order", async () => {
    const db = makeDb();
    const diff = emptyDiff();
    diff.update.schedules = [sched("promote", true), sched("demote", false)];
    diff.update.venueServices = [vsvc("v1")];
    diff.remove = {
      schedules: [],
      venueServices: [],
      scheduleServices: ["ss-x"],
      assignments: ["as-x"],
      dateRules: ["dr-x"],
    };
    diff.create.schedules = [sched("new-s", true)];
    diff.create.venueServices = [vsvc("new-v")];
    diff.create.scheduleServices = [ssvc("new-ss")];
    diff.create.assignments = [asg("new-as")];
    diff.create.dateRules = [rule("new-dr")];
    diff.update.scheduleServices = [ssvc("ss1")];
    diff.update.assignments = [asg("as1")];
    diff.update.dateRules = [rule("dr1")];

    await writeConfigDiff(asDb(db), "venue-1", diff, ctx);

    expect(calls).toEqual([
      "schedule.update",
      "schedule.update",
      "venueService.update",
      "scheduleService.deleteMany",
      "assignment.deleteMany",
      "dateRule.updateMany",
      "schedule.create",
      "venueService.create",
      "scheduleService.create",
      "assignment.create",
      "dateRule.create",
      "scheduleService.update",
      "assignment.update",
      "dateRule.update",
      "dateRuleTable.deleteMany",
    ]);
  });

  it("applies schedule demotions before promotions", async () => {
    const db = makeDb();
    const diff = emptyDiff();
    diff.update.schedules = [sched("promote", true), sched("demote", false)];

    await writeConfigDiff(asDb(db), "venue-1", diff, ctx);

    expect(
      db.schedule.update.mock.calls.map((c) => (c[0] as { where: { id: string } }).where.id)
    ).toEqual(["demote", "promote"]);
  });

  it("hard-deletes removed services and assignments, soft-deletes removed date rules", async () => {
    const db = makeDb();
    const diff = emptyDiff();
    diff.remove = {
      schedules: [],
      venueServices: [],
      scheduleServices: ["a", "b"],
      assignments: ["c"],
      dateRules: ["d"],
    };

    await writeConfigDiff(asDb(db), "venue-1", diff, ctx);

    expect(db.scheduleService.deleteMany).toHaveBeenCalledWith({
      where: { venueId: "venue-1", id: { in: ["a", "b"] } },
    });
    expect(db.scheduleAssignment.deleteMany).toHaveBeenCalledWith({
      where: { venueId: "venue-1", id: { in: ["c"] } },
    });
    expect(db.dateRule.updateMany).toHaveBeenCalledWith({
      where: { venueId: "venue-1", id: { in: ["d"] } },
      data: { deletedAt: ctx.now },
    });
  });

  it("skips every removal call when its id list is empty", async () => {
    const db = makeDb();

    await writeConfigDiff(asDb(db), "venue-1", emptyDiff(), ctx);

    expect(calls).toEqual([]);
  });
});

describe("date rule revive and rule tables", () => {
  it("revives a soft-deleted rule instead of creating it", async () => {
    const db = makeDb();
    const diff = emptyDiff();
    diff.create.dateRules = [rule("dr-1", { tableIds: ["t1"] })];

    await writeConfigDiff(asDb(db), "venue-1", diff, { ...ctx, revive: new Set(["dr-1"]) });

    expect(db.dateRule.create).not.toHaveBeenCalled();
    expect(db.dateRule.update).toHaveBeenCalledWith({
      where: { id: "dr-1" },
      data: expect.objectContaining({ deletedAt: null, kind: "closed" }),
    });
    expect(db.dateRuleTable.deleteMany).toHaveBeenCalledWith({
      where: { venueId: "venue-1", dateRuleId: "dr-1" },
    });
    expect(calls).toEqual([
      "dateRule.update",
      "dateRuleTable.deleteMany",
      "dateRuleTable.createMany",
    ]);
  });

  it("creates one table row per id, each carrying the venue (create path)", async () => {
    const db = makeDb();
    const diff = emptyDiff();
    diff.create.dateRules = [rule("dr-1", { tableIds: ["t1", "t2"] })];

    await writeConfigDiff(asDb(db), "venue-1", diff, ctx);

    expect(db.dateRuleTable.createMany).toHaveBeenCalledWith({
      data: [
        { dateRuleId: "dr-1", tableId: "t1", venueId: "venue-1" },
        { dateRuleId: "dr-1", tableId: "t2", venueId: "venue-1" },
      ],
    });
  });

  it("replaces table rows on an update and skips createMany when tableIds is empty", async () => {
    const db = makeDb();
    const diff = emptyDiff();
    diff.update.dateRules = [rule("with", { tableIds: ["t1"] }), rule("without", { tableIds: [] })];

    await writeConfigDiff(asDb(db), "venue-1", diff, ctx);

    expect(db.dateRuleTable.createMany).toHaveBeenCalledTimes(1);
    expect(db.dateRuleTable.createMany).toHaveBeenCalledWith({
      data: [{ dateRuleId: "with", tableId: "t1", venueId: "venue-1" }],
    });
    expect(db.dateRuleTable.deleteMany).toHaveBeenCalledTimes(2);
  });
});

describe("unique-constraint handling", () => {
  const diffWithSchedule = () => {
    const diff = emptyDiff();
    diff.create.schedules = [sched("s-1", true)];
    return diff;
  };

  it("wraps P2002 on the primary key as ConfigRowConflict with onId true", async () => {
    const db = makeDb();
    db.schedule.create.mockRejectedValue({ code: "P2002", meta: { target: ["id"] } });

    const err = await writeConfigDiff(asDb(db), "venue-1", diffWithSchedule(), ctx).catch((e) => e);

    expect(err).toBeInstanceOf(ConfigRowConflict);
    expect(err).toMatchObject({ table: "schedules", id: "s-1", onId: true });
  });

  it("treats a _pkey constraint name as an id collision", async () => {
    const db = makeDb();
    db.schedule.create.mockRejectedValue({ code: "P2002", meta: { target: "schedules_pkey" } });

    const err = await writeConfigDiff(asDb(db), "venue-1", diffWithSchedule(), ctx).catch((e) => e);

    expect(err).toMatchObject({ onId: true });
  });

  it("marks onId false for another unique index", async () => {
    const db = makeDb();
    db.schedule.create.mockRejectedValue({ code: "P2002", meta: { target: ["venue_id", "name"] } });

    const err = await writeConfigDiff(asDb(db), "venue-1", diffWithSchedule(), ctx).catch((e) => e);

    expect(err).toBeInstanceOf(ConfigRowConflict);
    expect(err).toMatchObject({ onId: false });
  });

  it("propagates a non-P2002 error unwrapped", async () => {
    const db = makeDb();
    const boom = { code: "P2003", meta: {} };
    db.schedule.create.mockRejectedValue(boom);

    await expect(writeConfigDiff(asDb(db), "venue-1", diffWithSchedule(), ctx)).rejects.toBe(boom);
  });

  it("propagates a plain non-object throw unwrapped", async () => {
    const db = makeDb();
    db.schedule.create.mockRejectedValue("kaput");

    await expect(writeConfigDiff(asDb(db), "venue-1", diffWithSchedule(), ctx)).rejects.toBe(
      "kaput"
    );
  });
});

describe("dateRuleData derived fields", () => {
  it("sets source and expiresAt for a tonight rule", async () => {
    const db = makeDb();
    const diff = emptyDiff();
    diff.update.dateRules = [rule("t", { kind: "tonight", expiresAt: "2026-10-28T02:00:00.000Z" })];

    await writeConfigDiff(asDb(db), "venue-1", diff, ctx);

    const data = (db.dateRule.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.source).toBe("tonight");
    expect(data.expiresAt).toEqual(new Date("2026-10-28T02:00:00.000Z"));
  });

  it("omits source and nulls expiresAt for any other kind", async () => {
    const db = makeDb();
    const diff = emptyDiff();
    diff.update.dateRules = [rule("c", { expiresAt: "2026-10-28T02:00:00.000Z" })];

    await writeConfigDiff(asDb(db), "venue-1", diff, ctx);

    const data = (db.dateRule.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data).not.toHaveProperty("source");
    expect(data.expiresAt).toBeNull();
  });

  it("maps null repeat/window to DbNull and set ones to their JSON", async () => {
    const db = makeDb();
    const diff = emptyDiff();
    const repeat = { every: "week" };
    const window = { from: "17:00", to: "19:00" };
    diff.update.dateRules = [rule("nulls"), rule("set", { repeat, window })];

    await writeConfigDiff(asDb(db), "venue-1", diff, ctx);

    const [first, second] = db.dateRule.update.mock.calls.map(
      (c) => (c[0] as { data: Record<string, unknown> }).data
    );
    expect(first!.repeat).toBe(Prisma.DbNull);
    expect(first!.window).toBe(Prisma.DbNull);
    expect(second!.repeat).toEqual(repeat);
    expect(second!.window).toEqual(window);
  });
});
