import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      reservation: { groupBy: vi.fn() },
      venue: { findUnique: vi.fn() },
    },
  });
});

import { endOfServiceSummaryService } from "./end-of-service-summary.js";
import { prisma } from "./database.js";

type Status = "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";

interface Fixture {
  venueId: string;
  date: Date;
  startTime: Date;
  status: Status;
  partySize: number;
}

/**
 * Fixture reservations at a Los Angeles venue (UTC-7 in June). `date` is the
 * service day a booking opened on (ADR-029), so the 23:30 local seating on the
 * 19th has a UTC `startTime` on the 20th but still belongs to the 19th.
 */
const FIXTURES: Fixture[] = [
  {
    venueId: "v1",
    date: new Date("2026-06-19"),
    startTime: new Date("2026-06-20T01:00:00Z"),
    status: "COMPLETED",
    partySize: 4,
  },
  {
    venueId: "v1",
    date: new Date("2026-06-19"),
    startTime: new Date("2026-06-20T02:30:00Z"),
    status: "COMPLETED",
    partySize: 2,
  },
  // 23:30 PDT on the 19th = 06:30Z on the 20th (late-night, near the boundary)
  {
    venueId: "v1",
    date: new Date("2026-06-19"),
    startTime: new Date("2026-06-20T06:30:00Z"),
    status: "COMPLETED",
    partySize: 3,
  },
  {
    venueId: "v1",
    date: new Date("2026-06-19"),
    startTime: new Date("2026-06-20T03:00:00Z"),
    status: "NO_SHOW",
    partySize: 6,
  },
  {
    venueId: "v1",
    date: new Date("2026-06-19"),
    startTime: new Date("2026-06-20T03:00:00Z"),
    status: "CANCELLED",
    partySize: 5,
  },
  {
    venueId: "v1",
    date: new Date("2026-06-19"),
    startTime: new Date("2026-06-20T03:30:00Z"),
    status: "CONFIRMED",
    partySize: 8,
  },
  {
    venueId: "v1",
    date: new Date("2026-06-19"),
    startTime: new Date("2026-06-20T03:30:00Z"),
    status: "PENDING",
    partySize: 9,
  },
  // 00:30 PDT on the 20th: next service day, not the 19th
  {
    venueId: "v1",
    date: new Date("2026-06-20"),
    startTime: new Date("2026-06-20T07:30:00Z"),
    status: "COMPLETED",
    partySize: 7,
  },
  // another venue, same day
  {
    venueId: "v2",
    date: new Date("2026-06-19"),
    startTime: new Date("2026-06-20T01:00:00Z"),
    status: "COMPLETED",
    partySize: 10,
  },
];

function fakeGroupBy(args: { where: { venueId: string; date: Date } }) {
  const rows = FIXTURES.filter(
    (f) => f.venueId === args.where.venueId && f.date.getTime() === args.where.date.getTime()
  );
  const groups = new Map<Status, { count: number; sum: number }>();
  for (const row of rows) {
    const prev = groups.get(row.status) ?? { count: 0, sum: 0 };
    groups.set(row.status, { count: prev.count + 1, sum: prev.sum + row.partySize });
  }
  return Promise.resolve(
    [...groups].map(([status, g]) => ({
      status,
      _count: g.count,
      _sum: { partySize: g.sum },
    }))
  );
}

describe("endOfServiceSummaryService.getSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.reservation.groupBy).mockImplementation(fakeGroupBy as never);
  });

  it("counts covers, table turns and no-shows for the service date, including a late-night seating", async () => {
    const summary = await endOfServiceSummaryService.getSummary({
      venueId: "v1",
      date: "2026-06-19",
    });

    expect(summary).toEqual({
      date: "2026-06-19",
      venueId: "v1",
      covers: 9,
      tableTurns: 3,
      noShows: 1,
      turnedAway: null,
    });
  });

  it("scopes to the next service day without leaking the late-night seating", async () => {
    const summary = await endOfServiceSummaryService.getSummary({
      venueId: "v1",
      date: "2026-06-20",
    });

    expect(summary).toMatchObject({ covers: 7, tableTurns: 1, noShows: 0 });
  });

  it("returns zeros for a quiet day", async () => {
    const summary = await endOfServiceSummaryService.getSummary({
      venueId: "v1",
      date: "2026-01-01",
    });

    expect(summary).toMatchObject({ covers: 0, tableTurns: 0, noShows: 0, turnedAway: null });
  });

  it("returns only counts: no ids or guest fields", async () => {
    const summary = await endOfServiceSummaryService.getSummary({
      venueId: "v1",
      date: "2026-06-19",
    });

    expect(Object.keys(summary).sort()).toEqual(
      ["covers", "date", "noShows", "tableTurns", "turnedAway", "venueId"].sort()
    );
  });
});

describe("endOfServiceSummaryService.defaultServiceDate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the venue's local date, not the UTC date", async () => {
    vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({
      ianaTimezone: "America/Los_Angeles",
    } as never);

    // 03:30Z on the 20th is 20:30 on the 19th in Los Angeles.
    const date = await endOfServiceSummaryService.defaultServiceDate(
      "v1",
      new Date("2026-06-20T03:30:00Z")
    );

    expect(date).toBe("2026-06-19");
  });

  it("falls back to UTC when the venue is unknown", async () => {
    vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(null as never);

    const date = await endOfServiceSummaryService.defaultServiceDate(
      "v1",
      new Date("2026-06-20T03:30:00Z")
    );

    expect(date).toBe("2026-06-20");
  });
});
