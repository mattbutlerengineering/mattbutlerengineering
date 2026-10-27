import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../generated/prisma/index.js";

vi.mock("./database.js", () => ({ prisma: {} }));

const { listAvailabilityChanges, revertAvailabilityChange } =
  await import("./availability-changes.js");

const NOW = new Date("2026-10-25T19:00:00.000Z");
const TZ = "America/Los_Angeles";

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

const row = (over: Record<string, unknown>) => ({
  id: "chg-1",
  venueId: "venue-1",
  actorId: "auth0|ana",
  at: new Date("2026-10-25T18:00:00.000Z"),
  kind: "config",
  summary: "Availability updated: 0 added, 1 changed, 0 removed",
  affectedFrom: new Date("2026-10-25T00:00:00.000Z"),
  affectedTo: null,
  notifiedGuests: false,
  revertedById: null,
  inverse: null,
  ...over,
});

describe("listAvailabilityChanges", () => {
  const query = { limit: 25, offset: 0 };

  it("reads a closure's outcome counts from the stored meta, and leaves old rows without them", async () => {
    const withOutcome = row({
      id: "chg-2",
      kind: "closure",
      inverse: {
        closure: {
          ruleId: "r",
          outcome: { cancelled: 14, moved: 1, kept: 2, closeEarly: false },
        },
      },
    });
    const old = row({ id: "chg-1", kind: "closure", inverse: { closure: { ruleId: "r" } } });
    const client = fakeClient({
      venue: { findUnique: vi.fn(async () => ({ id: "venue-1", ianaTimezone: TZ })) },
      availabilityChange: {
        findMany: vi.fn(async () => [withOutcome, old]),
        count: vi.fn(async () => 2),
        findFirst: vi.fn(async () => null),
      },
    });
    const page = await listAvailabilityChanges("venue-1", query, client);
    expect(page!.items[0]!.outcome).toEqual({
      cancelled: 14,
      moved: 1,
      kept: 2,
      closeEarly: false,
    });
    expect(page!.items[1]!.outcome).toBeNull();
  });

  it("answers an unknown venue as null", async () => {
    const client = fakeClient({ venue: { findUnique: vi.fn(async () => null) } });
    expect(await listAvailabilityChanges("venue-1", query, client)).toBeNull();
  });

  it("pages newest first and offers Revert only on the newest change that told no guest", async () => {
    const newest = row({ id: "chg-3", at: new Date("2026-10-25T18:30:00.000Z") });
    const older = row({ id: "chg-2" });
    const findMany = vi.fn(async () => [newest, older]);
    const client = fakeClient({
      venue: { findUnique: vi.fn(async () => ({ id: "venue-1", ianaTimezone: TZ })) },
      availabilityChange: {
        findMany,
        count: vi.fn(async () => 7),
        findFirst: vi.fn(async () => ({ id: "chg-3" })),
      },
    });

    const page = await listAvailabilityChanges("venue-1", { limit: 2, offset: 4 }, client);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ at: "desc" }, { id: "desc" }],
        skip: 4,
        take: 2,
      })
    );
    expect(page).toEqual({
      total: 7,
      offset: 4,
      items: [
        expect.objectContaining({
          id: "chg-3",
          at: "2026-10-25T18:30:00.000Z",
          affectedFrom: "2026-10-25",
          affectedTo: null,
          revertible: true,
        }),
        expect.objectContaining({ id: "chg-2", revertible: false }),
      ],
    });
  });

  it("never offers Revert on a change that told guests, was reverted, or is itself a revert", async () => {
    const rows = [
      row({ id: "a", notifiedGuests: true }),
      row({ id: "b", revertedById: "z" }),
      row({ id: "c", kind: "revert" }),
    ];
    const client = fakeClient({
      venue: { findUnique: vi.fn(async () => ({ id: "venue-1", ianaTimezone: TZ })) },
      availabilityChange: {
        findMany: vi.fn(async () => rows),
        count: vi.fn(async () => 3),
        findFirst: vi.fn(async () => ({ id: "a" })),
      },
    });

    const page = await listAvailabilityChanges("venue-1", query, client);

    expect(page?.items.map((i) => i.revertible)).toEqual([false, false, false]);
  });

  it("filters by made-on dates as the venue's local days, person and type", async () => {
    const findMany = vi.fn(async () => []);
    const client = fakeClient({
      venue: { findUnique: vi.fn(async () => ({ id: "venue-1", ianaTimezone: TZ })) },
      availabilityChange: {
        findMany,
        count: vi.fn(async () => 0),
        findFirst: vi.fn(async () => null),
      },
    });

    await listAvailabilityChanges(
      "venue-1",
      { ...query, from: "2026-10-01", to: "2026-10-31", actorId: "auth0|ana", kind: "revert" },
      client
    );

    // Los Angeles: Oct 1 starts 07:00Z (PDT); Oct 31 ends at Nov 1 00:00 local, which is
    // 07:00Z (PDT) -- a 23:30 PDT change on Oct 30 lands inside, not on Oct 31.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          venueId: "venue-1",
          actorId: "auth0|ana",
          kind: "revert",
          at: {
            gte: new Date("2026-10-01T07:00:00.000Z"),
            lt: new Date("2026-11-01T07:00:00.000Z"),
          },
        },
      })
    );
  });

  it("spans a daylight-saving change with the offset in force on each boundary", async () => {
    const findMany = vi.fn(async () => []);
    const client = fakeClient({
      venue: { findUnique: vi.fn(async () => ({ id: "venue-1", ianaTimezone: TZ })) },
      availabilityChange: {
        findMany,
        count: vi.fn(async () => 0),
        findFirst: vi.fn(async () => null),
      },
    });

    // Nov 1 2026 is the fall-back day: starts PDT (07:00Z), Nov 2 starts PST (08:00Z).
    await listAvailabilityChanges(
      "venue-1",
      { ...query, from: "2026-11-01", to: "2026-11-01" },
      client
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          venueId: "venue-1",
          at: {
            gte: new Date("2026-11-01T07:00:00.000Z"),
            lt: new Date("2026-11-02T08:00:00.000Z"),
          },
        },
      })
    );
  });
});

const CURRENT_SERVICE = {
  id: "ss-1",
  scheduleId: "sch-1",
  venueServiceId: "vs-dinner",
  opensAt: 1080,
  lastSeatingAt: 1260,
  closesAt: 1320,
  seating: { version: 1, interval: 15 },
  bookingTypes: ["online", "phone"],
};
const PRIOR_SERVICE = { ...CURRENT_SERVICE, opensAt: 1020 };

const inverse = (over: Record<string, unknown> = {}) => ({
  version: 1,
  restore: {
    schedules: [],
    venueServices: [],
    scheduleServices: [PRIOR_SERVICE],
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
  operatingHours: { friday: { open: "17:00", close: "22:00" } },
  ...over,
});

function revertingTx(options: {
  change?: Record<string, unknown> | null;
  newest?: string;
  service?: Record<string, unknown>;
  reservations?: unknown[];
  cas?: number;
}) {
  const service = options.service ?? CURRENT_SERVICE;
  const change =
    options.change === undefined ? row({ id: "chg-5", inverse: inverse() }) : options.change;
  return {
    schedule: {
      findMany: vi.fn(async () => [
        { id: "sch-1", name: "Regular", kind: "regular", isRegular: true, archivedAt: null },
      ]),
      update: vi.fn(async () => ({})),
    },
    venueService: {
      findMany: vi.fn(async () => [
        { id: "vs-dinner", name: "Dinner", position: 0, archivedAt: null },
      ]),
      update: vi.fn(async () => ({})),
    },
    scheduleService: {
      findMany: vi.fn(async () => [service]),
      update: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({})),
    },
    scheduleAssignment: {
      deleteMany: vi.fn(async () => ({})),
      findMany: vi.fn(async () => [
        {
          id: "as-1",
          scheduleId: "sch-1",
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          startsOn: null,
          endsOn: null,
          precedence: 0,
        },
      ]),
    },
    dateRule: { findMany: vi.fn(async () => []) },
    venue: {
      updateMany: vi.fn(async () => ({ count: options.cas ?? 1 })),
      findUnique: vi.fn(async () => ({
        id: "venue-1",
        ianaTimezone: TZ,
        settings: {},
        operatingHours: null,
        availabilityVersion: 6,
      })),
      update: vi.fn(async () => ({})),
    },
    reservation: { findMany: vi.fn(async () => options.reservations ?? []) },
    table: { findMany: vi.fn(async () => []) },
    availabilityChange: {
      // The target by id first; the newest unreverted change otherwise.
      findFirst: vi.fn(async (args: { where: { id?: string } }) =>
        args.where.id ? change : { id: options.newest ?? "chg-5" }
      ),
      create: vi.fn(async () => ({ id: "chg-6" })),
      update: vi.fn(async () => ({})),
    },
  };
}

const request = { venueId: "venue-1", changeId: "chg-5", actorId: "auth0|ben", now: NOW };

describe("revertAvailabilityChange", () => {
  it("applies the inverse as a new save and links the original to it", async () => {
    const tx = revertingTx({});

    const outcome = await revertAvailabilityChange(
      { ...request, expectedVersion: 5 },
      fakeClient(tx)
    );

    expect(outcome).toEqual({ kind: "saved", version: 6, changeId: "chg-6" });
    expect(tx.venue.updateMany).toHaveBeenCalledWith({
      where: { id: "venue-1", availabilityVersion: 5 },
      data: { availabilityVersion: { increment: 1 } },
    });
    expect(tx.scheduleService.update).toHaveBeenCalledWith({
      where: { id: "ss-1" },
      data: expect.objectContaining({ opensAt: 1020 }),
    });
    expect(tx.availabilityChange.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          venueId: "venue-1",
          actorId: "auth0|ben",
          kind: "revert",
          summary: "Reverted: Availability updated: 0 added, 1 changed, 0 removed",
        }),
      })
    );
    expect(tx.availabilityChange.update).toHaveBeenCalledWith({
      where: { id: "chg-5" },
      data: { revertedById: "chg-6" },
    });
    expect(tx.venue.update).toHaveBeenCalledWith({
      where: { id: "venue-1" },
      data: { operatingHours: { friday: { open: "17:00", close: "22:00" } } },
    });
  });

  it("answers a stale version with the change that won, touching nothing", async () => {
    const tx = revertingTx({ cas: 0 });
    tx.availabilityChange.findFirst = vi.fn(async () => ({
      id: "chg-9",
      actorId: "auth0|ana",
      at: NOW,
      kind: "config",
      summary: "Availability updated",
    })) as never;

    const outcome = await revertAvailabilityChange(
      { ...request, expectedVersion: 4 },
      fakeClient(tx)
    );

    expect(outcome.kind).toBe("version_conflict");
    expect(tx.availabilityChange.create).not.toHaveBeenCalled();
  });

  it("answers an unknown change as change_not_found", async () => {
    const tx = revertingTx({ change: null });
    const outcome = await revertAvailabilityChange(
      { ...request, expectedVersion: 5 },
      fakeClient(tx)
    );
    expect(outcome).toEqual({ kind: "change_not_found" });
    expect(tx.scheduleService.update).not.toHaveBeenCalled();
  });

  it.each([
    ["guests_notified", { notifiedGuests: true }, undefined],
    ["already_reverted", { revertedById: "chg-9" }, undefined],
    ["not_revertable", { kind: "revert" }, undefined],
    ["superseded", {}, "chg-7"],
  ])("refuses with %s and writes nothing", async (reason, over, newest) => {
    const tx = revertingTx({
      change: row({ id: "chg-5", inverse: inverse(), ...over }),
      newest,
    });

    const outcome = await revertAvailabilityChange(
      { ...request, expectedVersion: 5 },
      fakeClient(tx)
    );

    expect(outcome).toEqual({ kind: "refused", reason });
    expect(tx.scheduleService.update).not.toHaveBeenCalled();
    expect(tx.availabilityChange.create).not.toHaveBeenCalled();
  });

  it("refuses an inverse it cannot read as not_revertable", async () => {
    const tx = revertingTx({ change: row({ id: "chg-5", inverse: { version: 2 } }) });
    const outcome = await revertAvailabilityChange(
      { ...request, expectedVersion: 5 },
      fakeClient(tx)
    );
    expect(outcome).toEqual({ kind: "refused", reason: "not_revertable" });
  });

  it("refuses with the stranded bookings the revert would leave outside service", async () => {
    // Fri 2026-11-06 22:30 Pacific: served now (closes 23:00), not after the revert.
    const stretched = { ...CURRENT_SERVICE, lastSeatingAt: 1320, closesAt: 1380 };
    const tx = revertingTx({
      service: stretched,
      change: row({
        id: "chg-5",
        inverse: inverse({
          restore: {
            schedules: [],
            venueServices: [],
            scheduleServices: [CURRENT_SERVICE],
            assignments: [],
            dateRules: [],
          },
        }),
      }),
      reservations: [
        {
          id: "res-1",
          tableId: null,
          startTime: new Date("2026-11-07T06:30:00.000Z"),
          partySize: 2,
          date: new Date("2026-11-06T00:00:00.000Z"),
        },
      ],
    });

    const outcome = await revertAvailabilityChange(
      { ...request, expectedVersion: 5 },
      fakeClient(tx)
    );

    expect(outcome).toEqual({
      kind: "stranded",
      reservations: [expect.objectContaining({ id: "res-1" })],
    });
    expect(tx.availabilityChange.create).not.toHaveBeenCalled();
    expect(tx.availabilityChange.update).not.toHaveBeenCalled();
  });

  it("undoes a venue's first save back to no hours, restoring the column as null", async () => {
    const tx = revertingTx({
      change: row({
        id: "chg-5",
        inverse: inverse({
          restore: {
            schedules: [],
            venueServices: [],
            scheduleServices: [],
            assignments: [],
            dateRules: [],
          },
          remove: {
            schedules: ["sch-1"],
            venueServices: ["vs-dinner"],
            scheduleServices: ["ss-1"],
            assignments: ["as-1"],
            dateRules: [],
          },
          operatingHours: null,
        }),
      }),
    });

    const outcome = await revertAvailabilityChange(
      { ...request, expectedVersion: 5 },
      fakeClient(tx)
    );

    expect(outcome).toEqual({ kind: "saved", version: 6, changeId: "chg-6" });
    expect(tx.venue.update).toHaveBeenCalledWith({
      where: { id: "venue-1" },
      data: { operatingHours: Prisma.DbNull },
    });
  });

  it("revives a date rule the change soft-deleted instead of creating it again", async () => {
    const removed = {
      id: "dr-gone",
      kind: "closure",
      targetKind: "venue",
      startsOn: "2026-12-24",
      endsOn: "2026-12-24",
    };
    const tx = revertingTx({
      change: row({
        id: "chg-5",
        inverse: inverse({
          restore: {
            schedules: [],
            venueServices: [],
            scheduleServices: [],
            assignments: [],
            dateRules: [removed],
          },
        }),
      }),
    });
    // The rule is soft-deleted, so the live read (deletedAt: null) does not return it.
    const dateRule = {
      findMany: vi.fn(async () => []),
      update: vi.fn(async () => ({})),
      create: vi.fn(async () => ({})),
    };
    const dateRuleTable = {
      deleteMany: vi.fn(async () => ({})),
      createMany: vi.fn(async () => ({})),
    };

    const outcome = await revertAvailabilityChange(
      { ...request, expectedVersion: 5 },
      fakeClient({ ...tx, dateRule, dateRuleTable })
    );

    expect(outcome).toEqual({ kind: "saved", version: 6, changeId: "chg-6" });
    expect(dateRule.update).toHaveBeenCalledWith({
      where: { id: "dr-gone" },
      data: expect.objectContaining({ kind: "closure", deletedAt: null }),
    });
    expect(dateRule.create).not.toHaveBeenCalled();
    expect(dateRuleTable.deleteMany).toHaveBeenCalledWith({
      where: { venueId: "venue-1", dateRuleId: "dr-gone" },
    });
  });
});
