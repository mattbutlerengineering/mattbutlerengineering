import { describe, expect, it, vi } from "vitest";
import type { DateRule } from "@mbe/types";

vi.mock("./database.js", () => ({ prisma: {} }));

const { getClosureImpact } = await import("./closure-impact-store.js");

const NOW = new Date("2026-10-25T19:00:00.000Z");
const TZ = "America/Los_Angeles";

const rows = () => ({
  schedule: {
    findMany: vi.fn(async () => [
      {
        id: "sch-1",
        venueId: "venue-1",
        name: "Regular",
        kind: "regular",
        isRegular: true,
        archivedAt: null,
      },
    ]),
  },
  venueService: {
    findMany: vi.fn(async () => [
      { id: "vs-dinner", venueId: "venue-1", name: "Dinner", position: 0, archivedAt: null },
    ]),
  },
  scheduleService: {
    findMany: vi.fn(async () => [
      {
        id: "ss-1",
        venueId: "venue-1",
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
        venueId: "venue-1",
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
    findUnique: vi.fn(async () => ({
      ianaTimezone: TZ,
      settings: {},
      operatingHours: null,
      availabilityVersion: 4,
    })),
  },
  table: { findMany: vi.fn(async () => [{ id: "t-1" }]) },
  reservation: {
    findMany: vi.fn(async () => [
      {
        id: "res-1",
        tableId: "t-1",
        date: new Date("2026-12-24T00:00:00.000Z"),
        startTime: new Date("2026-12-25T03:00:00.000Z"),
        endTime: new Date("2026-12-25T04:30:00.000Z"),
        partySize: 4,
        guestName: "Rivera",
        deposit: { amountCents: 4000, currency: "usd", status: "held" },
      },
      {
        id: "res-2",
        tableId: "t-1",
        date: new Date("2026-12-24T00:00:00.000Z"),
        startTime: new Date("2026-12-25T03:30:00.000Z"),
        endTime: new Date("2026-12-25T05:00:00.000Z"),
        partySize: 2,
        guestName: "Okafor",
        deposit: { amountCents: 2000, currency: "usd", status: "refunded" },
      },
    ]),
  },
});

function fakeClient(tx: ReturnType<typeof rows>) {
  const full = {
    $executeRaw: vi.fn(async () => 0),
    $executeRawUnsafe: vi.fn(async () => 0),
    ...tx,
  };
  return {
    client: {
      $transaction: vi.fn(async (work: (t: unknown) => Promise<unknown>) => work(full)),
    } as never,
    tx,
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

describe("getClosureImpact", () => {
  it("returns the affected bookings, counting only deposits still held", async () => {
    const { client, tx } = fakeClient(rows());

    const outcome = await getClosureImpact("venue-1", closure(), NOW, client);

    expect(outcome).toMatchObject({
      kind: "ok",
      impact: { reservations: 2, covers: 6, depositsHeld: 1 },
    });
    expect(tx.reservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          venueId: "venue-1",
          date: {
            gte: new Date("2026-12-24T00:00:00.000Z"),
            lte: new Date("2026-12-24T00:00:00.000Z"),
          },
          OR: [
            { startTime: { gte: NOW } },
            {
              status: { in: ["PENDING", "CONFIRMED"] },
              startTime: { gte: new Date("2026-10-25T18:30:00.000Z") },
              endTime: { gt: NOW },
            },
          ],
        }),
      })
    );
  });

  it("counts a captured deposit with a payment intent: a cancel owes the guest its refund", async () => {
    const { client, tx } = fakeClient(rows());
    const base = (await tx.reservation.findMany())[0]!;
    const withDeposit = (id: string, status: string, pi: string | null) => ({
      ...base,
      id,
      deposit: { amountCents: 3000, currency: "usd", status, stripePaymentIntentId: pi },
    });
    tx.reservation.findMany.mockResolvedValueOnce([
      withDeposit("res-applied", "applied", "pi_1"),
      withDeposit("res-forfeited", "forfeited", "pi_2"),
      withDeposit("res-partial", "partial_refunded", "pi_3"),
      withDeposit("res-no-pi", "applied", null),
      withDeposit("res-uncollectable", "uncollectable", "pi_4"),
    ] as never);

    const outcome = await getClosureImpact("venue-1", closure(), NOW, client);

    expect(outcome).toMatchObject({ kind: "ok", impact: { depositsHeld: 3 } });
  });

  it("scans from yesterday's service day when the closure starts in the past", async () => {
    const { client, tx } = fakeClient(rows());

    await getClosureImpact("venue-1", closure({ startsOn: "2026-10-01" }), NOW, client);

    expect(tx.reservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: expect.objectContaining({ gte: new Date("2026-10-24T00:00:00.000Z") }),
        }),
      })
    );
  });

  it("bounds an open-ended closure to a year", async () => {
    const { client, tx } = fakeClient(rows());

    await getClosureImpact("venue-1", closure({ endsOn: null }), NOW, client);

    expect(tx.reservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: expect.objectContaining({ lte: new Date("2027-12-25T00:00:00.000Z") }),
        }),
      })
    );
  });

  it("refuses an explicit range longer than a year", async () => {
    const { client } = fakeClient(rows());
    const outcome = await getClosureImpact(
      "venue-1",
      closure({ startsOn: "2026-12-24", endsOn: "2028-01-01" }),
      NOW,
      client
    );
    expect(outcome).toEqual({ kind: "too_long" });
  });

  it("counts the year from today, so a long-running series is not too long", async () => {
    const { client } = fakeClient(rows());
    const series = closure({
      startsOn: "2026-01-04",
      endsOn: "2027-02-01",
      repeat: { version: 1, weekdays: [4] },
    });
    const outcome = await getClosureImpact("venue-1", series, NOW, client);
    expect(outcome.kind).toBe("ok");
  });

  it("refuses a draft that does not validate against the config", async () => {
    const { client, tx } = fakeClient(rows());

    const outcome = await getClosureImpact(
      "venue-1",
      closure({ targetKind: "service", venueServiceId: "vs-other" }),
      NOW,
      client
    );

    expect(outcome).toMatchObject({
      kind: "invalid",
      issues: [expect.objectContaining({ code: "unknown_reference" })],
    });
    expect(tx.reservation.findMany).not.toHaveBeenCalled();
  });

  it("is not found for an unknown venue", async () => {
    const data = rows();
    data.venue.findUnique = vi.fn(async () => null as never);
    const { client } = fakeClient(data);

    expect(await getClosureImpact("venue-1", closure(), NOW, client)).toEqual({
      kind: "not_found",
    });
  });
});

type Where = {
  startTime?: { gte: Date };
  endTime?: { gt: Date };
  status?: { in?: string[]; notIn?: string[] };
  OR?: Where[];
};
type SeededRow = { id: string; status: string; startTime: Date; endTime: Date };

/** Applies the where clause the store sends, so a test seeds rows and sees who is returned. */
function matches(row: SeededRow, where: Where): boolean {
  if (where.OR && !where.OR.some((w) => matches(row, w))) return false;
  if (where.startTime && !(row.startTime >= where.startTime.gte)) return false;
  if (where.endTime && !(row.endTime > where.endTime.gt)) return false;
  if (where.status?.in && !where.status.in.includes(row.status)) return false;
  if (where.status?.notIn?.includes(row.status)) return false;
  return true;
}

describe("getClosureImpact and a booking that has already started", () => {
  // 7:05 PM on Sun 25 Oct in Los Angeles; the 7:00 PM booking has not arrived yet.
  const LATE = new Date("2026-10-26T02:05:00.000Z");
  const seeded = (status: string): SeededRow => ({
    id: "late-1",
    status,
    startTime: new Date("2026-10-26T02:00:00.000Z"),
    endTime: new Date("2026-10-26T03:30:00.000Z"),
  });

  async function impactFor(status: string, now: Date = LATE) {
    const data = rows();
    const row = seeded(status);
    data.reservation.findMany = vi.fn(async (args: { where: Where }) =>
      [row]
        .filter((r) => matches(r, args.where))
        .map((r) => ({
          ...r,
          tableId: "t-1",
          date: new Date("2026-10-25T00:00:00.000Z"),
          partySize: 4,
          guestName: "Late Guest",
          deposit: null,
        }))
    ) as never;
    const { client } = fakeClient(data);
    const rule = closure({ startsOn: "2026-10-25", endsOn: "2026-10-25" });
    return getClosureImpact("venue-1", rule, now, client);
  }

  it("puts a CONFIRMED booking running late in the closed group", async () => {
    const outcome = await impactFor("CONFIRMED");
    expect(outcome).toMatchObject({ kind: "ok", impact: { reservations: 1 } });
    if (outcome.kind !== "ok") return;
    expect(outcome.impact.groups).toHaveLength(1);
    expect(outcome.impact.groups[0]).toMatchObject({ kind: "closed" });
    expect(outcome.impact.groups[0]?.reservations.map((r) => r.id)).toEqual(["late-1"]);
  });

  it("keeps a late guest at exactly the grace window, and drops a party past it as seated", async () => {
    const edge = new Date("2026-10-26T02:30:00.000Z"); // 30 minutes after the 7:00 PM start
    expect(await impactFor("CONFIRMED", edge)).toMatchObject({
      kind: "ok",
      impact: { reservations: 1 },
    });
    const past = new Date("2026-10-26T02:30:00.001Z");
    expect(await impactFor("CONFIRMED", past)).toMatchObject({
      kind: "ok",
      impact: { reservations: 0 },
    });
  });

  it("leaves a CONFIRMED booking at 7:45 PM out: that party is treated as seated", async () => {
    const outcome = await impactFor("CONFIRMED", new Date("2026-10-26T02:45:00.000Z"));
    expect(outcome).toMatchObject({ kind: "ok", impact: { reservations: 0, groups: [] } });
  });

  it.each(["COMPLETED", "CANCELLED", "NO_SHOW"])("leaves a %s booking out", async (status) => {
    const outcome = await impactFor(status);
    expect(outcome).toMatchObject({ kind: "ok", impact: { reservations: 0, groups: [] } });
  });
});
