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
          startTime: { gte: NOW },
        }),
      })
    );
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
