import { describe, expect, it, vi } from "vitest";
import type { AvailabilityConfig, PutAvailabilityConfigBody } from "@mbe/types";

vi.mock("./database.js", () => ({ prisma: {} }));

const { planSave, saveAvailabilityConfig, getAvailabilityConfig, previewAvailabilityConfig } =
  await import("./availability-config.js");
type ConfigState = Parameters<typeof planSave>[0]["state"];

const NOW = new Date("2026-10-25T19:00:00.000Z");
const TZ = "America/Los_Angeles";

const CONFIG: AvailabilityConfig = {
  schedules: [{ id: "sch-1", name: "Regular", kind: "regular", isRegular: true }],
  venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
  scheduleServices: [
    {
      id: "ss-1",
      scheduleId: "sch-1",
      venueServiceId: "vs-dinner",
      opensAt: 1020,
      lastSeatingAt: 1260,
      closesAt: 1320,
      seating: { version: 1, interval: 15 },
      bookingTypes: ["online", "phone"],
    },
  ],
  assignments: [
    { id: "as-1", scheduleId: "sch-1", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
  ],
  dateRules: [],
};

const STATE: ConfigState = {
  stored: CONFIG,
  effective: CONFIG,
  source: "rows",
  version: 3,
  timezone: TZ,
  operatingHours: null,
};

const body = (changes: Partial<PutAvailabilityConfigBody["changes"]>, expectedVersion = 3) => ({
  expectedVersion,
  changes: { upsert: {}, remove: {}, ...changes },
  scopeConflicts: "keep" as const,
});

const CLOSE_NOV_6 = body({
  upsert: {
    dateRules: [
      {
        id: "dr-c",
        kind: "closure",
        targetKind: "venue",
        startsOn: "2026-11-06",
        endsOn: "2026-11-06",
      },
    ],
  },
});

// Fri 2026-11-06 19:00 Pacific.
const BOOKING = {
  id: "res-1",
  tableId: null,
  startTime: new Date("2026-11-07T03:00:00.000Z"),
  partySize: 4,
};

describe("planSave", () => {
  it("refuses an invalid config with validateConfig's issue paths", () => {
    const plan = planSave({
      state: STATE,
      body: body({
        upsert: { scheduleServices: [{ ...CONFIG.scheduleServices[0]!, lastSeatingAt: 1400 }] },
      }),
      bookings: [],
      tableIds: new Set(),
      now: NOW,
    });

    expect(plan).toEqual({
      kind: "invalid",
      issues: [expect.objectContaining({ path: "scheduleServices[0].lastSeatingAt" })],
    });
  });

  it("refuses a change that strands a booking", () => {
    const plan = planSave({
      state: STATE,
      body: CLOSE_NOV_6,
      bookings: [BOOKING],
      tableIds: new Set(),
      now: NOW,
    });

    expect(plan).toEqual({
      kind: "stranded",
      reservations: [
        { id: "res-1", startTime: "2026-11-07T03:00:00.000Z", partySize: 4, reason: "closed" },
      ],
    });
  });

  it("plans the write, its inverse and the affected dates", () => {
    const plan = planSave({
      state: STATE,
      body: CLOSE_NOV_6,
      bookings: [],
      tableIds: new Set(),
      now: NOW,
    });

    expect(plan.kind).toBe("write");
    if (plan.kind !== "write") return;
    expect(plan.diff.create.dateRules.map((r) => r.id)).toEqual(["dr-c"]);
    expect(plan.inverse.remove.dateRules).toEqual(["dr-c"]);
    expect(plan.range).toEqual({ from: "2026-11-06", to: "2026-11-06" });
  });

  it("writes a legacy-derived config as rows on the first save", () => {
    const legacy: ConfigState = {
      ...STATE,
      stored: {
        ...CONFIG,
        schedules: [],
        venueServices: [],
        scheduleServices: [],
        assignments: [],
      },
      source: "legacy",
    };

    const plan = planSave({
      state: legacy,
      body: body({}),
      bookings: [],
      tableIds: new Set(),
      now: NOW,
    });

    expect(plan.kind === "write" && plan.diff.create.schedules.map((s) => s.id)).toEqual(["sch-1"]);
  });
});

describe("planSave with exact: true (a revert applies the prior rows as they were)", () => {
  type DateRuleRow = AvailabilityConfig["dateRules"][number];
  const hours = (id: string, startsOn: string, endsOn: string | null, opts = {}): DateRuleRow =>
    ({
      id,
      kind: "special_hours",
      targetKind: "venue",
      startsOn,
      endsOn,
      payload: {
        version: 1,
        services: [
          {
            venueServiceId: "vs-dinner",
            opensAt: 1080,
            lastSeatingAt: 1200,
            closesAt: 1260,
            seating: { version: 1, interval: 15 },
            bookingTypes: ["online", "phone"],
          },
        ],
      },
      ...opts,
    }) as DateRuleRow;
  const fridaysB = hours("B", "2026-11-01", null, { repeat: { version: 1, weekdays: [5] } });
  const rangeA = hours("A", "2026-12-20", "2026-12-31");
  const stateOf = (config: AvailabilityConfig): ConfigState => ({
    ...STATE,
    stored: config,
    effective: config,
  });
  const plan = (state: ConfigState, changes: PutAvailabilityConfigBody["changes"], exact = false) =>
    planSave({
      state,
      body: { expectedVersion: 3, changes, scopeConflicts: "keep" },
      bookings: [],
      tableIds: new Set(),
      now: NOW,
      newId: () => "skip-new",
      ...(exact ? { exact: true } : {}),
    });
  const asChanges = (inverse: {
    restore: PutAvailabilityConfigBody["changes"]["upsert"];
    remove: PutAvailabilityConfigBody["changes"]["remove"];
  }) => ({ upsert: inverse.restore, remove: inverse.remove });

  it("restores overlapping hours rules without re-adding the skip a Keep save created", () => {
    const before = { ...CONFIG, dateRules: [fridaysB, rangeA] };
    const edited = hours("A", "2026-12-20", "2026-12-31", { staffNote: "edited" });
    const forward = plan(stateOf(before), { upsert: { dateRules: [edited] }, remove: {} });
    expect(forward.kind).toBe("write");
    if (forward.kind !== "write") return;
    // Forward saves still settle conflicts: A's edit meets B on Fri Dec 25.
    expect(forward.next.dateRules.filter((r) => r.kind === "skip")).toHaveLength(1);

    const revert = plan(stateOf(forward.next), asChanges(forward.inverse), true);

    expect(revert.kind).toBe("write");
    if (revert.kind !== "write") return;
    expect(revert.next.dateRules).toEqual(before.dateRules);
  });

  it("reverts a split of a repeating-rule range back to the single rule", () => {
    const before = { ...CONFIG, dateRules: [fridaysB, rangeA] };
    const ended = { ...rangeA, endsOn: "2026-12-24" };
    const created = { ...hours("A-2", "2026-12-25", "2026-12-31") };
    const forward = plan(stateOf(before), { upsert: { dateRules: [ended, created] }, remove: {} });
    expect(forward.kind).toBe("write");
    if (forward.kind !== "write") return;
    expect(forward.next.dateRules.some((r) => r.kind === "skip")).toBe(true);

    const revert = plan(stateOf(forward.next), asChanges(forward.inverse), true);

    expect(revert.kind === "write" && revert.next.dateRules).toEqual(before.dateRules);
  });
});

/** A `$transaction` client whose transaction is `tx`. */
function fakeClient(tx: Record<string, unknown>) {
  const full = {
    $executeRaw: vi.fn(async () => 0),
    $executeRawUnsafe: vi.fn(async () => 0),
    ...tx,
  };
  return {
    $transaction: vi.fn(async (work: (t: unknown) => Promise<unknown>) => work(full)),
  } as never;
}

const emptyRows = () => ({
  schedule: { findMany: vi.fn(async () => []) },
  venueService: { findMany: vi.fn(async () => []) },
  scheduleService: { findMany: vi.fn(async () => []) },
  scheduleAssignment: { findMany: vi.fn(async () => []) },
  dateRule: { findMany: vi.fn(async () => []) },
});

describe("saveAvailabilityConfig", () => {
  it("answers a stale version with the change that won", async () => {
    const winner = {
      id: "chg-9",
      actorId: "auth0|ana",
      at: new Date("2026-10-25T18:42:00.000Z"),
      kind: "config",
      summary: "Availability updated: 1 added, 0 changed, 0 removed",
    };
    const client = fakeClient({
      venue: {
        updateMany: vi.fn(async () => ({ count: 0 })),
        findUnique: vi.fn(async () => ({ id: "venue-1" })),
      },
      availabilityChange: { findFirst: vi.fn(async () => winner) },
    });

    const outcome = await saveAvailabilityConfig(
      { venueId: "venue-1", actorId: "auth0|ben", body: body({}, 2), now: NOW },
      client
    );

    expect(outcome).toEqual({
      kind: "version_conflict",
      winningChange: { ...winner, at: "2026-10-25T18:42:00.000Z" },
    });
  });

  /** A transaction a full save can run through; `rows` overrides per delegate. */
  function savingTx(rows: Record<string, object> = {}) {
    const empty = emptyRows();
    const created = () => vi.fn(async () => ({}));
    return {
      ...empty,
      schedule: { ...empty.schedule, create: created() },
      venueService: { ...empty.venueService, create: created() },
      scheduleService: { ...empty.scheduleService, create: created() },
      scheduleAssignment: { ...empty.scheduleAssignment, create: created() },
      venue: {
        updateMany: vi.fn(async () => ({ count: 1 })),
        findUnique: vi.fn(async () => ({
          ianaTimezone: TZ,
          settings: {},
          operatingHours: null,
          availabilityVersion: 4,
        })),
        update: vi.fn(async () => ({})),
      },
      reservation: { findMany: vi.fn(async () => []) },
      table: { findMany: vi.fn(async () => []) },
      availabilityChange: { create: vi.fn(async () => ({ id: "chg-10" })) },
      ...rows,
    };
  }

  const WHOLE_WEEK = body({ upsert: { ...CONFIG, dateRules: [] } }, 3);

  it("commits rows, the audit row and the legacy projection together", async () => {
    const tx = savingTx();

    const outcome = await saveAvailabilityConfig(
      { venueId: "venue-1", actorId: "auth0|ben", body: WHOLE_WEEK, now: NOW },
      fakeClient(tx)
    );

    expect(outcome).toEqual({ kind: "saved", version: 4, changeId: "chg-10" });
    expect(tx.availabilityChange.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ venueId: "venue-1", actorId: "auth0|ben", kind: "config" }),
      })
    );
    expect(tx.venue.update).toHaveBeenCalledWith({
      where: { id: "venue-1" },
      data: {
        operatingHours: expect.objectContaining({ friday: { open: "17:00", close: "22:00" } }),
      },
    });
  });

  it("answers an id another row already holds with 422 id_taken, not a 500", async () => {
    const taken = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: { modelName: "Schedule", target: ["id"] },
    });
    const empty = emptyRows();
    const tx = savingTx({
      schedule: { ...empty.schedule, create: vi.fn(async () => Promise.reject(taken)) },
    });

    const outcome = await saveAvailabilityConfig(
      { venueId: "venue-1", actorId: "auth0|ben", body: WHOLE_WEEK, now: NOW },
      fakeClient(tx)
    );

    expect(outcome).toEqual({
      kind: "invalid",
      issues: [expect.objectContaining({ path: "schedules[0].id", code: "id_taken" })],
    });
    expect(tx.availabilityChange.create).not.toHaveBeenCalled();
  });

  it("lets a non-unique database error through", async () => {
    const empty = emptyRows();
    const tx = savingTx({
      schedule: {
        ...empty.schedule,
        create: vi.fn(async () => Promise.reject(new Error("connection reset"))),
      },
    });

    await expect(
      saveAvailabilityConfig(
        { venueId: "venue-1", actorId: "auth0|ben", body: WHOLE_WEEK, now: NOW },
        fakeClient(tx)
      )
    ).rejects.toThrow("connection reset");
  });

  it("rolls back and reports invalid config", async () => {
    const create = vi.fn();
    const client = fakeClient({
      ...emptyRows(),
      venue: {
        updateMany: vi.fn(async () => ({ count: 1 })),
        findUnique: vi.fn(async () => ({
          ianaTimezone: TZ,
          settings: {},
          operatingHours: null,
          availabilityVersion: 1,
        })),
      },
      reservation: { findMany: vi.fn(async () => []) },
      table: { findMany: vi.fn(async () => []) },
      availabilityChange: { create },
    });

    const outcome = await saveAvailabilityConfig(
      { venueId: "venue-1", actorId: "auth0|ben", body: body({}, 0), now: NOW },
      client
    );

    expect(outcome).toEqual({
      kind: "invalid",
      issues: [expect.objectContaining({ code: "no_regular_schedule" })],
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("scans from yesterday's service day so a running past-midnight service is checked", async () => {
    const findMany = vi.fn(async () => []);
    const client = fakeClient({
      ...emptyRows(),
      venue: {
        updateMany: vi.fn(async () => ({ count: 1 })),
        findUnique: vi.fn(async () => ({
          ianaTimezone: TZ,
          settings: {},
          operatingHours: null,
          availabilityVersion: 1,
        })),
      },
      reservation: { findMany },
      table: { findMany: vi.fn(async () => []) },
      availabilityChange: { create: vi.fn() },
    });
    // 00:10 on Sat 7 Nov in Los Angeles: Friday's service day is still running.
    const late = new Date("2026-11-07T08:10:00.000Z");

    await saveAvailabilityConfig(
      { venueId: "venue-1", actorId: "auth0|ben", body: body({}, 0), now: late },
      client
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: { gte: new Date("2026-11-06T00:00:00.000Z") },
          OR: [
            { startTime: { gte: late } },
            { status: { in: ["PENDING", "CONFIRMED"] }, endTime: { gt: late } },
          ],
        }),
      })
    );
  });
});

describe("getAvailabilityConfig", () => {
  it("serves a venue with no rows its legacy-derived config at version 0", async () => {
    const client = fakeClient({
      ...emptyRows(),
      venue: {
        findUnique: vi.fn(async () => ({
          ianaTimezone: TZ,
          settings: {},
          operatingHours: { friday: { open: "17:00", close: "22:00" } },
          availabilityVersion: 0,
        })),
      },
    });

    const first = await getAvailabilityConfig("venue-1", NOW, client);
    const second = await getAvailabilityConfig("venue-1", NOW, client);

    expect(first).toMatchObject({ source: "legacy", version: 0 });
    expect(first?.config.schedules).toHaveLength(1);
    expect(second?.config).toEqual(first?.config);
  });
});

// Monday's open cannot be read (25:00); Friday's can. The strict backfill
// rejects the whole venue; the lenient reader closes Monday, as the listing does.
const UNREADABLE_HOURS = {
  monday: { open: "25:00", close: "22:00" },
  friday: { open: "17:00", close: "22:00" },
};

const venueWith = (operatingHours: unknown) => ({
  updateMany: vi.fn(async () => ({ count: 1 })),
  findUnique: vi.fn(async () => ({
    ianaTimezone: TZ,
    settings: {},
    operatingHours,
    availabilityVersion: 0,
  })),
  update: vi.fn(async () => ({})),
});

describe("a venue whose legacy hours the strict reader rejects", () => {
  it("reads leniently, as guests see it, with the closed day noted", async () => {
    const client = fakeClient({ ...emptyRows(), venue: venueWith(UNREADABLE_HOURS) });

    const state = await getAvailabilityConfig("venue-1", NOW, client);

    expect(state).toMatchObject({
      source: "legacy",
      legacyNotes: { unreadableDays: [expect.stringContaining("monday")] },
    });
    expect(state?.config.scheduleServices.length).toBeGreaterThan(0);
  });

  it("does not silently strand or overwrite: closing Friday's booking is a 409", async () => {
    const venue = venueWith(UNREADABLE_HOURS);
    const change = { create: vi.fn() };
    const scheduleCreate = vi.fn();
    const empty = emptyRows();
    const client = fakeClient({
      ...empty,
      schedule: { ...empty.schedule, create: scheduleCreate },
      venue,
      // A future Friday booking, served by the leniently read Friday hours.
      reservation: { findMany: vi.fn(async () => [BOOKING]) },
      table: { findMany: vi.fn(async () => []) },
      availabilityChange: change,
    });
    // Removing the derived services, as an editor working from the lenient
    // read would, closes Friday.
    const read = await getAvailabilityConfig(
      "venue-1",
      NOW,
      fakeClient({ ...emptyRows(), venue: venueWith(UNREADABLE_HOURS) })
    );
    const closeEveryDay = body(
      { remove: { scheduleServices: read!.config.scheduleServices.map((s) => s.id) } },
      0
    );

    const outcome = await saveAvailabilityConfig(
      { venueId: "venue-1", actorId: "auth0|ben", body: closeEveryDay, now: NOW },
      client
    );

    expect(outcome).toMatchObject({
      kind: "stranded",
      reservations: [expect.objectContaining({ id: "res-1" })],
    });
    expect(venue.update).not.toHaveBeenCalled();
    expect(scheduleCreate).not.toHaveBeenCalled();
    expect(change.create).not.toHaveBeenCalled();
  });

  it("keeps a venue with no hours at all as empty", async () => {
    const client = fakeClient({ ...emptyRows(), venue: venueWith(null) });
    expect(await getAvailabilityConfig("venue-1", NOW, client)).toMatchObject({ source: "empty" });
  });

  it("reports hours not even the lenient reader can read as unreadable", async () => {
    const client = fakeClient({ ...emptyRows(), venue: venueWith({ version: 99 }) });
    expect(await getAvailabilityConfig("venue-1", NOW, client)).toMatchObject({
      source: "unreadable",
      legacyProblem: { reason: "unknown_version" },
    });
  });
});

describe("previewAvailabilityConfig", () => {
  const PREVIEW_BODY = {
    draft: {
      changes: { upsert: { ...CONFIG, dateRules: [] }, remove: {} },
      scopeConflicts: "keep" as const,
    },
    scope: { from: "2026-11-01" },
    focusDate: "2026-11-02",
    strandedOffset: 0,
  };

  const previewTx = (venue: object | null, reservations: () => Promise<unknown[]>) => ({
    ...emptyRows(),
    venue: { findUnique: vi.fn(async () => venue) },
    reservation: { findMany: vi.fn(reservations) },
    table: { findMany: vi.fn(async () => []) },
  });

  it("answers an unknown venue as not found", async () => {
    const outcome = await previewAvailabilityConfig(
      { venueId: "venue-1", body: PREVIEW_BODY, now: NOW },
      fakeClient(previewTx(null, async () => []))
    );
    expect(outcome).toEqual({ kind: "not_found" });
  });

  it("previews the draft at the stored version, writing nothing", async () => {
    const venue = { ianaTimezone: TZ, settings: {}, operatingHours: null, availabilityVersion: 4 };
    const outcome = await previewAvailabilityConfig(
      { venueId: "venue-1", body: PREVIEW_BODY, now: NOW },
      fakeClient(previewTx(venue, async () => []))
    );
    expect(outcome.kind).toBe("ok");
    if (outcome.kind !== "ok") return;
    expect(outcome.result.version).toBe(4);
    expect(outcome.result.days).toHaveLength(30);
    expect(outcome.result.days[0]?.added.length).toBeGreaterThan(0);
  });

  it("gives up after the timeout with preview-timeout", async () => {
    const venue = { ianaTimezone: TZ, settings: {}, operatingHours: null, availabilityVersion: 4 };
    const outcome = await previewAvailabilityConfig(
      { venueId: "venue-1", body: PREVIEW_BODY, now: NOW, timeoutMs: 20 },
      fakeClient(previewTx(venue, () => new Promise(() => {})))
    );
    expect(outcome).toEqual({ kind: "timeout" });
  });
});
