import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The booking gate end to end on the hold path, with the real gate, loader,
 * engine and bookSlot over an in-memory database: a closure saved between hold
 * create and confirm makes the confirm fail (consistency table, architecture.md
 * § Data model — the gate reads committed config inside the booking transaction).
 */

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      venue: { findUnique: vi.fn() },
      table: { findUnique: vi.fn() },
      reservationHold: { findUnique: vi.fn() },
      $transaction: vi.fn(),
    },
  });
});

vi.mock("./availability.js", () => ({
  availabilityService: {
    fetchConflictData: vi.fn().mockResolvedValue({ reservations: [], holds: [] }),
    findBestTable: vi.fn(),
  },
}));

import { holdService } from "./hold.js";
import { confirmHold } from "./confirm-hold.js";
import { prisma } from "./database.js";

const NOW = new Date("2026-11-01T12:00:00Z");
// Thursday 2026-11-05, 19:00 in Los Angeles (PST, UTC−8): inside Dinner 17:00–22:00.
const SLOT = "2026-11-06T03:00:00.000Z";
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const VENUE = {
  id: "v1",
  ianaTimezone: "America/Los_Angeles",
  settings: null,
  availabilityVersion: 1,
  operatingHours: null,
};

const closure = {
  id: "r-closed",
  kind: "closure",
  targetKind: "venue",
  venueServiceId: null,
  bookingTypes: [],
  startsOn: d("2026-11-05"),
  endsOn: d("2026-11-05"),
  repeat: null,
  window: null,
  payload: {},
  useScheduleId: null,
  seriesId: null,
  guestMessage: "Closed for a private event",
  staffNote: null,
  expiresAt: null,
  tables: [],
};

type Row = Record<string, unknown>;

/** Committed state every transaction reads. */
interface World {
  dateRules: unknown[];
  holds: Row[];
  reservations: Row[];
}

function makeTx(world: World) {
  const rows = (result: () => unknown) => ({ findMany: vi.fn(async () => result()) });
  return {
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $executeRaw: vi.fn().mockResolvedValue(0),
    venue: { findUnique: vi.fn(async () => VENUE) },
    schedule: rows(() => [
      {
        id: "s1",
        venueId: "v1",
        name: "Regular",
        kind: "regular",
        isRegular: true,
        archivedAt: null,
      },
    ]),
    venueService: rows(() => [
      { id: "vs1", venueId: "v1", name: "Dinner", position: 0, archivedAt: null },
    ]),
    scheduleService: rows(() => [
      {
        id: "ss1",
        venueId: "v1",
        scheduleId: "s1",
        venueServiceId: "vs1",
        opensAt: 1020,
        lastSeatingAt: 1260,
        closesAt: 1320,
        seating: { version: 1, interval: 15 },
        bookingTypes: ["online", "phone"],
        rules: {},
      },
    ]),
    scheduleAssignment: rows(() => [
      {
        id: "a1",
        venueId: "v1",
        scheduleId: "s1",
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        startsOn: null,
        endsOn: null,
        precedence: 0,
      },
    ]),
    dateRule: rows(() => world.dateRules),
    table: rows(() => [
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
    reservation: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn(async () => world.reservations),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = {
          id: "res-1",
          ...data,
          table: null,
          guest: null,
          createdAt: NOW,
          updatedAt: NOW,
        };
        world.reservations.push(row);
        return row;
      }),
    },
    reservationEvent: { create: vi.fn().mockResolvedValue({ id: "evt-1" }) },
    reservationHold: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        world.holds.filter((h) => where.sessionId === undefined || h.sessionId === where.sessionId)
      ),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      delete: vi.fn(async ({ where }: { where: Row }) => {
        world.holds = world.holds.filter((h) => h.id !== where.id);
      }),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { id: "hold-1", createdAt: NOW, ...data };
        world.holds.push(row);
        return row;
      }),
    },
  };
}

describe("booking gate on the hold path", () => {
  let world: World;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    world = { dateRules: [], holds: [], reservations: [] };
    vi.mocked(prisma.venue.findUnique).mockResolvedValue(VENUE as never);
    vi.mocked(prisma.table.findUnique).mockResolvedValue({
      venueId: "v1",
      capacity: 4,
      minCovers: 1,
      maxCovers: null,
    } as never);
    vi.mocked(prisma.reservationHold.findUnique).mockImplementation(
      (async () => world.holds[0] ?? null) as never
    );
    vi.mocked(prisma.$transaction).mockImplementation(((fn: (tx: unknown) => Promise<unknown>) =>
      fn(makeTx(world))) as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createHold = () =>
    holdService.create(
      { venueId: "v1", date: "2026-11-05", time: SLOT, partySize: 2, tableId: "t1" },
      "session-1"
    );

  it("confirms a hold when availability is unchanged", async () => {
    expect((await createHold()).success).toBe(true);

    const result = await confirmHold({
      holdId: "hold-1",
      sessionId: "session-1",
      guestDetails: {},
    });

    expect(result.success).toBe(true);
  });

  it("fails the confirm when a closure is saved between hold and confirm, consuming the hold", async () => {
    expect((await createHold()).success).toBe(true);

    world.dateRules = [closure];
    const result = await confirmHold({
      holdId: "hold-1",
      sessionId: "session-1",
      guestDetails: {},
    });

    expect(result).toMatchObject({
      success: false,
      errorCode: "NOT_BOOKABLE",
      rejection: {
        code: "outside-availability",
        reason: "closed",
        message: "Closed for a private event",
      },
    });
    expect(world.reservations).toEqual([]);
    expect(world.holds).toEqual([]);
  });

  it("refuses the hold itself once the closure is saved", async () => {
    world.dateRules = [closure];

    const result = await createHold();

    expect(result).toMatchObject({
      success: false,
      rejection: { code: "outside-availability", reason: "closed" },
    });
    expect(world.holds).toEqual([]);
  });
});
