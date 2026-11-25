import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      noSlotSearch: { groupBy: vi.fn() },
      venue: { findUnique: vi.fn() },
    },
  });
});

import { lostDemandReportService } from "./lost-demand-report.js";
import { prisma } from "./database.js";

interface Row {
  date: string;
  requestedMinute: number;
  searches: number;
}

function groupRows(rows: Row[]) {
  return rows.map((r) => ({
    date: new Date(`${r.date}T00:00:00.000Z`),
    requestedMinute: r.requestedMinute,
    _sum: { searches: r.searches },
  }));
}

describe("lostDemandReportService.getLostDemand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("buckets timed searches by venue-local weekday and hour", async () => {
    vi.mocked(prisma.noSlotSearch.groupBy).mockResolvedValueOnce(
      groupRows([
        // 2026-06-19 is a Friday (5). 19:30 and 19:45 share hour 19.
        { date: "2026-06-19", requestedMinute: 19 * 60 + 30, searches: 3 },
        { date: "2026-06-19", requestedMinute: 19 * 60 + 45, searches: 2 },
        // The next Friday folds into the same weekday x hour cell.
        { date: "2026-06-26", requestedMinute: 19 * 60, searches: 4 },
        // 23:30 stays on its own service date's weekday, never tomorrow's.
        { date: "2026-06-19", requestedMinute: 23 * 60 + 30, searches: 1 },
        { date: "2026-06-20", requestedMinute: 0, searches: 6 },
      ]) as never
    );

    const result = await lostDemandReportService.getLostDemand({
      venueId: "v1",
      from: "2026-06-01",
      to: "2026-06-30",
    });

    expect(result.cells).toEqual(
      expect.arrayContaining([
        { weekday: 5, hour: 19, searches: 9 },
        { weekday: 5, hour: 23, searches: 1 },
        { weekday: 6, hour: 0, searches: 6 },
      ])
    );
    expect(result.cells).toHaveLength(3);
    expect(result.anyTime).toEqual([]);
    expect(result.total).toBe(16);
  });

  it("keeps whole-day (-1) misses out of the hour cells and totals them by weekday", async () => {
    vi.mocked(prisma.noSlotSearch.groupBy).mockResolvedValueOnce(
      groupRows([
        { date: "2026-06-19", requestedMinute: -1, searches: 5 },
        { date: "2026-06-26", requestedMinute: -1, searches: 2 },
        { date: "2026-06-20", requestedMinute: -1, searches: 1 },
        { date: "2026-06-19", requestedMinute: 18 * 60, searches: 3 },
      ]) as never
    );

    const result = await lostDemandReportService.getLostDemand({
      venueId: "v1",
      from: "2026-06-01",
      to: "2026-06-30",
    });

    expect(result.cells).toEqual([{ weekday: 5, hour: 18, searches: 3 }]);
    expect(result.anyTime).toEqual([
      { weekday: 5, searches: 7 },
      { weekday: 6, searches: 1 },
    ]);
    expect(result.total).toBe(11);
  });

  it("scopes the query to the venue and the inclusive date window", async () => {
    vi.mocked(prisma.noSlotSearch.groupBy).mockResolvedValueOnce([] as never);

    const result = await lostDemandReportService.getLostDemand({
      venueId: "v1",
      from: "2026-06-01",
      to: "2026-06-30",
    });

    expect(prisma.noSlotSearch.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          venueId: "v1",
          date: {
            gte: new Date("2026-06-01T00:00:00.000Z"),
            lte: new Date("2026-06-30T00:00:00.000Z"),
          },
        },
      })
    );
    expect(result).toEqual({
      venueId: "v1",
      from: "2026-06-01",
      to: "2026-06-30",
      total: 0,
      cells: [],
      anyTime: [],
    });
  });

  it("ignores a malformed stored minute rather than misplacing it", async () => {
    vi.mocked(prisma.noSlotSearch.groupBy).mockResolvedValueOnce(
      groupRows([{ date: "2026-06-19", requestedMinute: 9999, searches: 2 }]) as never
    );

    const result = await lostDemandReportService.getLostDemand({
      venueId: "v1",
      from: "2026-06-01",
      to: "2026-06-30",
    });

    expect(result.cells).toEqual([]);
    expect(result.anyTime).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe("lostDemandReportService.defaultWindow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ends today in the venue's time zone and spans 28 days", async () => {
    vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({
      ianaTimezone: "America/Los_Angeles",
    } as never);

    // 03:30Z on the 20th is still the 19th in Los Angeles.
    const window = await lostDemandReportService.defaultWindow(
      "v1",
      new Date("2026-06-20T03:30:00Z")
    );

    expect(window).toEqual({ from: "2026-05-23", to: "2026-06-19" });
  });
});
