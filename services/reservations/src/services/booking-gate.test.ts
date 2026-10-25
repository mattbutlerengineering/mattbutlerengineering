import { describe, expect, it, vi } from "vitest";
import type { LoadSnapshotOptions } from "./availability-snapshot.js";
import { gateProblem, judgeBooking, type GateRequest } from "./assert-bookable.js";

vi.mock("./database.js", () => ({ prisma: {} }));

type Db = NonNullable<LoadSnapshotOptions["db"]>;

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

// Thursday 2026-11-05 in Los Angeles (PST, UTC−8). Dinner 17:00–22:00, last seating 21:00.
const NOW = new Date("2026-11-01T12:00:00Z");
const at = (localIso: string) => new Date(`${localIso}-08:00`);

const dinner = {
  id: "ss1",
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

const closureOn = (date: string, guestMessage: string | null = null) => ({
  id: "r-closed",
  kind: "closure",
  targetKind: "venue",
  venueServiceId: null,
  bookingTypes: [],
  startsOn: d(date),
  endsOn: d(date),
  repeat: null,
  window: null,
  payload: {},
  useScheduleId: null,
  seriesId: null,
  guestMessage,
  staffNote: null,
  expiresAt: null,
  tables: [],
});

interface FakeRows {
  scheduleServices?: unknown[];
  dateRules?: unknown[];
  reservations?: unknown[];
  holds?: unknown[];
  sessionHolds?: unknown[];
  /** No availability rows; the venue's legacy `operatingHours` column is this value. */
  legacyHours?: unknown;
}

function fakeDb(rows: FakeRows = {}) {
  const delegate = (result: unknown) => ({
    findMany: vi.fn(async () => result),
    findUnique: vi.fn(async () => result),
  });
  const holds = rows.holds ?? [];
  const noRows = "legacyHours" in rows;
  const configRows = (value: unknown[]) => delegate(noRows ? [] : value);
  const db = {
    venue: delegate({
      ianaTimezone: "America/Los_Angeles",
      settings: null,
      availabilityVersion: 1,
      operatingHours: rows.legacyHours ?? null,
    }),
    schedule: configRows([
      {
        id: "sch1",
        venueId: "v1",
        name: "Regular",
        kind: "regular",
        isRegular: true,
        archivedAt: null,
      },
    ]),
    venueService: configRows([
      { id: "vs1", venueId: "v1", name: "Dinner", position: 0, archivedAt: null },
    ]),
    scheduleService: configRows(rows.scheduleServices ?? [dinner]),
    scheduleAssignment: configRows([
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
    dateRule: delegate(rows.dateRules ?? []),
    table: delegate([
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
    reservation: delegate(rows.reservations ?? []),
    reservationHold: {
      // The session lookup selects ids by sessionId; the snapshot load reads live holds.
      findMany: vi.fn(async (args: { where: { sessionId?: string } }) =>
        args.where.sessionId !== undefined ? (rows.sessionHolds ?? []) : holds
      ),
    },
  };
  return db as unknown as Db & { reservation: { findMany: ReturnType<typeof vi.fn> } };
}

const request = (overrides: Partial<GateRequest> = {}): GateRequest => ({
  venueId: "v1",
  tableId: "t1",
  start: at("2026-11-05T19:00:00"),
  partySize: 2,
  channel: "online",
  ...overrides,
});

const booked = (id: string, start: Date) => ({
  id,
  tableId: "t1",
  startTime: start,
  endTime: new Date(start.getTime() + 90 * 60_000),
  partySize: 2,
  expiresAt: new Date(NOW.getTime() + 10 * 60_000),
});

describe("judgeBooking", () => {
  it("accepts a seating inside the resolved service", async () => {
    expect(await judgeBooking(fakeDb(), request(), NOW)).toEqual({ kind: "ok" });
  });

  it("refuses a time outside every service as outside-availability", async () => {
    const outcome = await judgeBooking(
      fakeDb(),
      request({ start: at("2026-11-05T10:00:00") }),
      NOW
    );
    expect(outcome).toEqual({
      kind: "rejected",
      rejection: { code: "outside-availability", reason: "outside_service" },
    });
  });

  it("refuses a seating inside a closure, carrying the guest message", async () => {
    const db = fakeDb({ dateRules: [closureOn("2026-11-05", "Private event tonight")] });
    expect(await judgeBooking(db, request(), NOW)).toEqual({
      kind: "rejected",
      rejection: {
        code: "outside-availability",
        reason: "closed",
        message: "Private event tonight",
      },
    });
  });

  it("reports a seating after last seating as a soft limit", async () => {
    const outcome = await judgeBooking(
      fakeDb(),
      request({ start: at("2026-11-05T21:30:00") }),
      NOW
    );
    expect(outcome).toEqual({
      kind: "rejected",
      rejection: { code: "soft-limit", limits: ["after_last_seating"] },
    });
  });

  it("reports a taken table as a conflict, and ignores the excluded reservation", async () => {
    const reservations = [booked("res-1", at("2026-11-05T19:00:00"))];
    expect(await judgeBooking(fakeDb({ reservations }), request(), NOW)).toEqual({
      kind: "conflict",
    });
    expect(
      await judgeBooking(fakeDb({ reservations }), request({ excludeReservationId: "res-1" }), NOW)
    ).toEqual({ kind: "ok" });
  });

  it("ignores the excluded hold and the caller's own session holds", async () => {
    const holds = [booked("hold-1", at("2026-11-05T19:00:00"))];
    expect(await judgeBooking(fakeDb({ holds }), request(), NOW)).toEqual({ kind: "conflict" });
    expect(
      await judgeBooking(fakeDb({ holds }), request({ excludeHoldId: "hold-1" }), NOW)
    ).toEqual({ kind: "ok" });
    expect(
      await judgeBooking(
        fakeDb({ holds, sessionHolds: [{ id: "hold-1" }] }),
        request({ excludeSessionId: "session-1" }),
        NOW
      )
    ).toEqual({ kind: "ok" });
  });

  it("loads the venue-local service day and the day before (past-midnight seatings)", async () => {
    const late = { ...dinner, opensAt: 1200, lastSeatingAt: 1530, closesAt: 1560 };
    const db = fakeDb({ scheduleServices: [late] });
    // 01:00 on Friday belongs to Thursday's late service (ADR-029).
    const outcome = await judgeBooking(db, request({ start: at("2026-11-06T01:00:00") }), NOW);
    expect(outcome).toEqual({ kind: "ok" });
    // Service days D−1..D with the loader's ±1 day margin: Wed 11-04 .. Sat 11-07.
    expect(db.reservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ date: { gte: d("2026-11-04"), lte: d("2026-11-07") } }),
      })
    );
  });
});

describe("judgeBooking on a venue that never set hours", () => {
  const logger = () => ({ warn: vi.fn() });

  it("lets a staff (phone) booking through, with a warning", async () => {
    const log = logger();
    const outcome = await judgeBooking(
      fakeDb({ legacyHours: null }),
      request({ channel: "phone" }),
      NOW,
      log
    );
    expect(outcome).toEqual({ kind: "ok" });
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: "v1", tableId: "t1" }),
      "booking_gate_no_hours_staff_allowed"
    );
  });

  it("still refuses an online booking, as listing offers nothing", async () => {
    const outcome = await judgeBooking(fakeDb({ legacyHours: null }), request(), NOW, logger());
    expect(outcome).toEqual({
      kind: "rejected",
      rejection: { code: "outside-availability", reason: "outside_service" },
    });
  });

  it("refuses a staff booking inside an explicit closure", async () => {
    const db = fakeDb({ legacyHours: null, dateRules: [closureOn("2026-11-05", "Gone")] });
    expect(await judgeBooking(db, request({ channel: "phone" }), NOW, logger())).toEqual({
      kind: "rejected",
      rejection: { code: "outside-availability", reason: "closed", message: "Gone" },
    });
  });

  it("refuses a staff booking when phone bookings are closed for the day", async () => {
    const phoneClosed = {
      ...closureOn("2026-11-05"),
      targetKind: "booking",
      bookingTypes: ["phone"],
    };
    const db = fakeDb({ legacyHours: null, dateRules: [phoneClosed] });
    expect(await judgeBooking(db, request({ channel: "phone" }), NOW, logger())).toEqual({
      kind: "rejected",
      rejection: { code: "outside-availability", reason: "booking_closed" },
    });
  });

  it("refuses a staff booking when the hours exist but cannot be read (not 'never set')", async () => {
    const db = fakeDb({ legacyHours: { version: 9, weekly: {} } });
    expect(await judgeBooking(db, request({ channel: "phone" }), NOW, logger())).toEqual({
      kind: "rejected",
      rejection: { code: "outside-availability", reason: "outside_service" },
    });
  });
});

describe("gateProblem", () => {
  it("renders outside-availability as a 422 ProblemDetails with the reason", () => {
    const problem = gateProblem({
      code: "outside-availability",
      reason: "closed",
      message: "Gone fishing",
    });
    expect(problem).toMatchObject({
      status: 422,
      title: "Outside Availability",
      detail: "Gone fishing",
      code: "outside-availability",
      reason: "closed",
    });
  });

  it("renders soft-limit as a 422 ProblemDetails with the limits", () => {
    const problem = gateProblem({ code: "soft-limit", limits: ["pacing"] });
    expect(problem).toMatchObject({
      status: 422,
      title: "Soft Limit",
      code: "soft-limit",
      limits: ["pacing"],
    });
    expect(problem.detail).toEqual(expect.any(String));
  });
});
