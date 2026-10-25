import { describe, expect, it, vi } from "vitest";
import type { AvailabilityConfig, PutAvailabilityConfigBody } from "@mbe/types";

vi.mock("./database.js", () => ({ prisma: {} }));

const { planSave, saveAvailabilityConfig, getAvailabilityConfig } =
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

  it("commits rows, the audit row and the legacy projection together", async () => {
    const update = vi.fn(async () => ({}));
    const create = vi.fn(async () => ({ id: "chg-10" }));
    const rows = emptyRows();
    const client = fakeClient({
      ...rows,
      schedule: { ...rows.schedule, createMany: vi.fn(async () => ({ count: 1 })) },
      venueService: { ...rows.venueService, createMany: vi.fn(async () => ({ count: 1 })) },
      scheduleService: { ...rows.scheduleService, createMany: vi.fn(async () => ({ count: 1 })) },
      scheduleAssignment: {
        ...rows.scheduleAssignment,
        createMany: vi.fn(async () => ({ count: 1 })),
      },
      venue: {
        updateMany: vi.fn(async () => ({ count: 1 })),
        findUnique: vi.fn(async () => ({
          ianaTimezone: TZ,
          settings: {},
          operatingHours: null,
          availabilityVersion: 4,
        })),
        update,
      },
      reservation: { findMany: vi.fn(async () => []) },
      table: { findMany: vi.fn(async () => []) },
      availabilityChange: { create },
    });

    const outcome = await saveAvailabilityConfig(
      {
        venueId: "venue-1",
        actorId: "auth0|ben",
        body: body({ upsert: { ...CONFIG, dateRules: [] } }, 3),
        now: NOW,
      },
      client
    );

    expect(outcome).toEqual({ kind: "saved", version: 4, changeId: "chg-10" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ venueId: "venue-1", actorId: "auth0|ben", kind: "config" }),
      })
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: "venue-1" },
      data: {
        operatingHours: expect.objectContaining({ friday: { open: "17:00", close: "22:00" } }),
      },
    });
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
