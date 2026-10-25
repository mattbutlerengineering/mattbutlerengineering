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
  venue?: Record<string, unknown>;
  schedules?: unknown[];
  venueServices?: unknown[];
  scheduleServices?: unknown[];
  assignments?: unknown[];
  dateRules?: unknown[];
}

/** A venue the backfill has not reached: legacy hours only, no availability rows. */
const unmigrated = (operatingHours: unknown): FakeRows => ({
  venue: { operatingHours },
  schedules: [],
  venueServices: [],
  scheduleServices: [],
  assignments: [],
});

const LEGACY_WEEK = {
  monday: { open: "17:00", close: "22:00" },
  tuesday: { open: "17:00", close: "22:00" },
  wednesday: { open: "17:00", close: "22:00" },
  thursday: { open: "17:00", close: "22:00" },
  friday: { open: "17:00", close: "23:00" },
  saturday: { open: "17:00", close: "23:00" },
  sunday: { open: "17:00", close: "21:00", closed: true },
};

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
      operatingHours: null,
      ...rows.venue,
    }),
    schedule: delegate(
      "schedule",
      rows.schedules ?? [
        {
          id: "sch1",
          venueId: "v1",
          name: "Regular",
          kind: "regular",
          isRegular: true,
          archivedAt: null,
        },
      ]
    ),
    venueService: delegate(
      "venueService",
      rows.venueServices ?? [
        { id: "vs1", venueId: "v1", name: "Dinner", position: 0, archivedAt: null },
      ]
    ),
    scheduleService: delegate("scheduleService", rows.scheduleServices ?? [goodScheduleService]),
    scheduleAssignment: delegate(
      "scheduleAssignment",
      rows.assignments ?? [
        {
          id: "a1",
          venueId: "v1",
          scheduleId: "sch1",
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          startsOn: null,
          endsOn: null,
          precedence: 0,
        },
      ]
    ),
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

  it("reads the rows, not the legacy column, once a regular schedule exists", async () => {
    const { db } = fakeDb({ venue: { operatingHours: LEGACY_WEEK } });
    const { snapshot, source } = await loadAvailabilitySnapshot(
      "v1",
      "2026-11-05",
      "2026-11-05",
      now,
      { db }
    );
    expect(source).toBe("rows");
    expect(snapshot.config.schedules.map((s) => s.id)).toEqual(["sch1"]);
  });

  describe("venue the backfill has not reached (no regular schedule row)", () => {
    it("builds the config in memory from the legacy operatingHours", async () => {
      const { db } = fakeDb(unmigrated(LEGACY_WEEK));
      const { snapshot, source, warnings } = await loadAvailabilitySnapshot(
        "v1",
        "2026-11-05",
        "2026-11-08",
        now,
        { db }
      );
      expect(source).toBe("legacy");
      expect(warnings).toEqual([]);
      expect(snapshot.config.schedules.filter((s) => s.isRegular)).toHaveLength(1);
      // Thursday 17:00-22:00 at the venue's 30-minute interval, last seating 20:30.
      const thursday = listSlots(snapshot, "2026-11-05", 2, "online", now);
      expect(thursday.map((s) => s.minute)).toEqual([
        1020, 1050, 1080, 1110, 1140, 1170, 1200, 1230,
      ]);
      // Sunday is closed in the legacy column.
      expect(listSlots(snapshot, "2026-11-08", 2, "online", now)).toEqual([]);
    });

    it("still applies date rule rows on top of the legacy-derived week", async () => {
      const { db } = fakeDb({
        ...unmigrated(LEGACY_WEEK),
        dateRules: [{ ...baseRule, id: "r-closed", endsOn: d("2026-11-05") }],
      });
      const { snapshot } = await loadAvailabilitySnapshot("v1", "2026-11-05", "2026-11-06", now, {
        db,
      });
      expect(listSlots(snapshot, "2026-11-05", 2, "online", now)).toEqual([]);
      expect(listSlots(snapshot, "2026-11-06", 2, "online", now).length).toBeGreaterThan(0);
    });

    it("closes only an unreadable or implausible day, one warning each, as legacy did", async () => {
      const { db } = fakeDb(
        unmigrated({
          monday: { open: "", close: "22:00" }, // a cleared time input
          tuesday: { open: "09:00", close: "08:00" }, // 23 hours past midnight
          wednesday: { open: "17:00:00", close: "22:00:00" },
          thursday: { open: "17:00", close: "22:00" },
        })
      );
      const logger = { warn: vi.fn() };
      const { snapshot, source, warnings } = await loadAvailabilitySnapshot(
        "v1",
        "2026-11-02",
        "2026-11-05",
        now,
        { db, logger }
      );
      expect(source).toBe("legacy");
      expect(warnings).toEqual([
        expect.objectContaining({ table: "venues", reason: expect.stringContaining("monday") }),
        expect.objectContaining({ table: "venues", reason: expect.stringContaining("tuesday") }),
      ]);
      expect(logger.warn).toHaveBeenCalledTimes(2);
      expect(listSlots(snapshot, "2026-11-02", 2, "online", now)).toEqual([]); // Monday
      expect(listSlots(snapshot, "2026-11-03", 2, "online", now)).toEqual([]); // Tuesday
      const wednesday = listSlots(snapshot, "2026-11-04", 2, "online", now);
      const thursday = listSlots(snapshot, "2026-11-05", 2, "online", now);
      expect(wednesday.map((s) => s.minute)).toEqual(thursday.map((s) => s.minute));
      expect(thursday.length).toBeGreaterThan(0);
    });

    it("is closed, with a warning, when the legacy shape is unrecognised", async () => {
      const { db } = fakeDb(unmigrated({ version: 9, weekly: {} }));
      const logger = { warn: vi.fn() };
      const { snapshot, source, warnings } = await loadAvailabilitySnapshot(
        "v1",
        "2026-11-05",
        "2026-11-05",
        now,
        { db, logger }
      );
      expect(source).toBe("none");
      expect(warnings).toEqual([
        expect.objectContaining({
          table: "venues",
          id: "v1",
          reason: expect.stringContaining("unknown_version"),
        }),
      ]);
      expect(logger.warn).toHaveBeenCalledOnce();
      expect(listSlots(snapshot, "2026-11-05", 2, "online", now)).toEqual([]);
    });

    it("is closed without a warning when nothing is configured at all", async () => {
      const { db } = fakeDb(unmigrated(null));
      const { snapshot, source, warnings } = await loadAvailabilitySnapshot(
        "v1",
        "2026-11-05",
        "2026-11-05",
        now,
        { db }
      );
      expect(source).toBe("none");
      expect(warnings).toEqual([]);
      expect(listSlots(snapshot, "2026-11-05", 2, "online", now)).toEqual([]);
    });
  });

  it("returns the venue's full settings for callers that need more than the engine reads", async () => {
    const { db } = fakeDb({ venue: { settings: { phone: "555-0100", minAdvanceBooking: 2 } } });
    const { venueSettings } = await loadAvailabilitySnapshot(
      "v1",
      "2026-11-05",
      "2026-11-05",
      now,
      {
        db,
      }
    );
    expect(venueSettings).toEqual({ phone: "555-0100", minAdvanceBooking: 2 });
  });
});
