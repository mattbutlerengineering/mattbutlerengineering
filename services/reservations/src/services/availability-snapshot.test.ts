import { describe, expect, it, vi } from "vitest";
import { listSlots, resolveDay } from "@mbe/availability";
import type { LoadSnapshotOptions } from "./availability-snapshot.js";
import { loadAvailabilitySnapshot } from "./availability-snapshot.js";

vi.mock("./database.js", () => ({ prisma: {} }));

type Db = NonNullable<LoadSnapshotOptions["db"]>;

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const goodScheduleService = {
  id: "ss-ok",
  venueId: "v1",
  scheduleId: "sch1",
  venueServiceId: "vs1",
  opensAt: 1020,
  lastSeatingAt: 1260,
  closesAt: 1320,
  seating: { version: 1, interval: 15 },
  bookingTypes: ["online", "phone"],
  rules: {},
};

const baseRule = {
  kind: "closure",
  targetKind: "venue",
  venueServiceId: null,
  bookingTypes: [],
  startsOn: d("2026-11-05"),
  endsOn: null,
  repeat: null,
  window: null,
  payload: {},
  useScheduleId: null,
  seriesId: null,
  guestMessage: null,
  staffNote: null,
  expiresAt: null,
  tables: [],
};

interface FakeRows {
  scheduleServices?: unknown[];
  dateRules?: unknown[];
}

function fakeDb(rows: FakeRows = {}) {
  const calls: string[] = [];
  const delegate = (name: string, result: unknown) => ({
    findMany: vi.fn(async () => {
      calls.push(name);
      return result;
    }),
    findUnique: vi.fn(async () => {
      calls.push(name);
      return result;
    }),
  });
  const db = {
    venue: delegate("venue", {
      ianaTimezone: "America/Los_Angeles",
      settings: { slotIntervalMinutes: 30, maxPartySize: 8, unrelated: true },
      availabilityVersion: 7,
    }),
    schedule: delegate("schedule", [
      {
        id: "sch1",
        venueId: "v1",
        name: "Regular",
        kind: "regular",
        isRegular: true,
        archivedAt: null,
      },
    ]),
    venueService: delegate("venueService", [
      { id: "vs1", venueId: "v1", name: "Dinner", position: 0, archivedAt: null },
    ]),
    scheduleService: delegate("scheduleService", rows.scheduleServices ?? [goodScheduleService]),
    scheduleAssignment: delegate("scheduleAssignment", [
      {
        id: "a1",
        venueId: "v1",
        scheduleId: "sch1",
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        startsOn: null,
        endsOn: null,
        precedence: 0,
      },
    ]),
    dateRule: delegate("dateRule", rows.dateRules ?? []),
    table: delegate("table", [
      {
        id: "t1",
        name: "T1",
        capacity: 4,
        minCovers: 1,
        maxCovers: null,
        isActive: true,
        priority: 0,
      },
    ]),
    reservation: delegate("reservation", []),
    reservationHold: delegate("reservationHold", []),
  };
  return { db: db as unknown as Db, calls };
}

describe("loadAvailabilitySnapshot", () => {
  const now = new Date("2026-11-01T12:00:00Z");

  it("issues the same fixed set of queries whatever the range length", async () => {
    const short = fakeDb();
    const long = fakeDb();
    await loadAvailabilitySnapshot("v1", "2026-11-05", "2026-11-05", now, { db: short.db });
    await loadAvailabilitySnapshot("v1", "2026-11-05", "2027-03-05", now, { db: long.db });
    expect(short.calls).toHaveLength(9);
    expect(long.calls).toHaveLength(9);
  });

  it("maps rows into a snapshot with version and engine settings", async () => {
    const { db } = fakeDb();
    const { snapshot, version, warnings } = await loadAvailabilitySnapshot(
      "v1",
      "2026-11-05",
      "2026-11-05",
      now,
      { db }
    );
    expect(warnings).toEqual([]);
    expect(version).toBe(7);
    expect(snapshot.timezone).toBe("America/Los_Angeles");
    expect(snapshot.settings?.slotIntervalMinutes).toBe(30);
    expect(snapshot.settings).not.toHaveProperty("unrelated");
    expect(snapshot.config.scheduleServices).toHaveLength(1);
    expect(snapshot.tables.map((t) => t.id)).toEqual(["t1"]);
  });

  it("loads a schedule service with an unknown seating version as closed, with a warning", async () => {
    const { db } = fakeDb({
      scheduleServices: [{ ...goodScheduleService, seating: { version: 2, interval: 15 } }],
    });
    const logger = { warn: vi.fn() };
    const { snapshot, warnings } = await loadAvailabilitySnapshot(
      "v1",
      "2026-11-05",
      "2026-11-05",
      now,
      { db, logger }
    );
    expect(snapshot.config.scheduleServices).toEqual([]);
    expect(warnings).toEqual([
      expect.objectContaining({ table: "schedule_services", id: "ss-ok" }),
    ]);
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(resolveDay(snapshot, "2026-11-05").services).toEqual([]);
    expect(listSlots(snapshot, "2026-11-05", 2, "online", now)).toEqual([]);
  });

  it("fails closed on a tonight rule with an unknown payload version", async () => {
    const { db } = fakeDb({
      dateRules: [
        {
          ...baseRule,
          id: "r-tonight",
          kind: "tonight",
          payload: { version: 9 },
          guestMessage: "Back soon",
          startsOn: d("2026-11-05"),
          endsOn: d("2026-11-05"),
        },
      ],
    });
    const { snapshot, warnings } = await loadAvailabilitySnapshot(
      "v1",
      "2026-11-05",
      "2026-11-05",
      now,
      { db }
    );
    expect(snapshot.config.dateRules).toEqual([
      expect.objectContaining({
        kind: "closure",
        id: "r-tonight",
        targetKind: "venue",
        startsOn: "2026-11-05",
        endsOn: "2026-11-05",
        guestMessage: "Back soon",
      }),
    ]);
    expect(warnings).toEqual([expect.objectContaining({ table: "date_rules", id: "r-tonight" })]);
    expect(resolveDay(snapshot, "2026-11-05").services).toEqual([]);
  });

  it("treats a booking closure with no channels listed as closing every channel", async () => {
    const { db } = fakeDb({
      dateRules: [{ ...baseRule, id: "r-booking", targetKind: "booking" }],
    });
    const { snapshot } = await loadAvailabilitySnapshot("v1", "2026-11-05", "2026-11-05", now, {
      db,
    });
    expect(snapshot.config.dateRules[0]).toMatchObject({
      bookingTypes: ["online", "phone", "waitlist"],
    });
  });

  it("expands empty booking types on a Tonight stop too", async () => {
    const { db } = fakeDb({
      dateRules: [
        {
          ...baseRule,
          id: "r-stop",
          kind: "tonight",
          targetKind: "booking",
          payload: { version: 1, stop: { from: 1140, to: 1200 } },
        },
      ],
    });
    const { snapshot, warnings } = await loadAvailabilitySnapshot(
      "v1",
      "2026-11-05",
      "2026-11-05",
      now,
      { db }
    );
    expect(warnings).toEqual([]);
    expect(snapshot.config.dateRules[0]).toMatchObject({
      kind: "tonight",
      bookingTypes: ["online", "phone", "waitlist"],
    });
  });

  it("throws when the venue is not visible", async () => {
    const { db } = fakeDb();
    (db.venue.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(
      loadAvailabilitySnapshot("v1", "2026-11-05", "2026-11-05", now, { db })
    ).rejects.toThrow(/not found/);
  });
});
