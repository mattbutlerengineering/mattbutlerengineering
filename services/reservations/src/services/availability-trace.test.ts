import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});
vi.mock("./availability-snapshot.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadAvailabilitySnapshot: vi.fn(),
}));

import type { BookingSnapshot } from "@mbe/availability";
import { availabilityService } from "./availability.js";
import { traceAvailabilityDay } from "./availability-trace.js";
import { VenueNotFoundError, loadAvailabilitySnapshot } from "./availability-snapshot.js";

const DATE = "2026-11-06"; // Friday, PST (UTC−8)
const NOW = new Date("2026-11-06T23:30:00Z"); // 3:30 PM PST
const at = (hhmm: string) => new Date(`${DATE}T${hhmm}:00-08:00`);

const snapshot: BookingSnapshot = {
  timezone: "America/Los_Angeles",
  config: {
    schedules: [{ id: "regular", name: "Regular", kind: "regular", isRegular: true }],
    venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
    scheduleServices: [
      {
        id: "dinner",
        scheduleId: "regular",
        venueServiceId: "vs-dinner",
        opensAt: 1020,
        lastSeatingAt: 1080,
        closesAt: 1200,
        seating: { version: 1, interval: 30 },
        bookingTypes: ["online", "phone"],
        weekdays: [],
        dayHours: { version: 1, sets: [] },
      },
    ],
    assignments: [
      { id: "as", scheduleId: "regular", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
    ],
    dateRules: [],
  },
  tables: [
    {
      id: "t-2",
      name: "2-top",
      capacity: 2,
      minCovers: 1,
      maxCovers: 2,
      isActive: true,
      priority: 1,
    },
    {
      id: "t-4",
      name: "4-top",
      capacity: 4,
      minCovers: 1,
      maxCovers: 4,
      isActive: true,
      priority: 2,
    },
  ],
  reservations: [
    { id: "r", tableId: "t-4", startTime: at("17:30"), endTime: at("19:00"), partySize: 4 },
  ],
  holds: [],
  settings: null,
};

function stubLoader() {
  vi.mocked(loadAvailabilitySnapshot).mockResolvedValue({
    snapshot,
    version: 1,
    warnings: [],
    source: "rows",
    unconfigured: false,
    venueSettings: { minAdvanceBooking: 2, maxAdvanceBooking: 30 },
  } as never);
}

describe("traceAvailabilityDay", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    stubLoader();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("bookable times equal what the public availability path offers", async () => {
    for (const partySize of [2, 3, 4, 9]) {
      const offered = await availabilityService.generateTimeSlots("venue-1", DATE, partySize);
      const trace = await traceAvailabilityDay("venue-1", DATE, partySize, NOW);
      expect(trace?.times.filter((t) => t.outcome === "bookable").map((t) => t.startsAt)).toEqual(
        offered.filter((s) => s.available).map((s) => s.time)
      );
    }
  });

  it("applies the venue's booking window and says which rule removed a time", async () => {
    const trace = await traceAvailabilityDay("venue-1", DATE, 2, NOW);
    expect(trace?.times[0]).toMatchObject({
      minute: 1020,
      outcome: "removed",
      reason: { code: "before_earliest", earliest: "2026-11-07T01:30:00.000Z" },
    });
    expect(trace?.times[1]).toMatchObject({ minute: 1050, outcome: "bookable" });
    expect(trace).toMatchObject({ basis: "current_rules", channel: "online", partySize: 2 });
  });

  it("labels a past date and applies no window to it", async () => {
    const trace = await traceAvailabilityDay("venue-1", "2026-11-01", 2, NOW);
    expect(trace?.basis).toBe("current_rules_past_date");
    expect(trace?.times.some((t) => t.reason?.code === "before_earliest")).toBe(false);
  });

  it("answers null for an unknown venue", async () => {
    vi.mocked(loadAvailabilitySnapshot).mockRejectedValueOnce(new VenueNotFoundError("nope"));
    expect(await traceAvailabilityDay("nope", DATE, 2, NOW)).toBeNull();
  });
});
