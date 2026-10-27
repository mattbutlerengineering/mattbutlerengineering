process.env.TZ = "UTC";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Reservation, Table } from "@mbe/types";
import { TimelineGrid } from "./TimelineGrid.js";

vi.mock("../../contexts/venue-context-object.js", () => ({
  useOptionalVenue: () => ({
    selectedVenue: { ianaTimezone: "UTC", currencyCode: "USD" },
  }),
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

const HOUR_WIDTH = 120;
const TABLE_COLUMN_WIDTH = 120;
const START_HOUR = 11;
const TABLE = { id: "t1", name: "Table 1", capacity: 4, status: "AVAILABLE" } as unknown as Table;

// A seating on Oct 30 that runs until 01:30 the next morning, so the grid grows past 24:00.
const LATE_SEATING = {
  id: "res-1",
  date: "2026-10-30",
  startTime: "2026-10-30T23:00:00.000Z",
  endTime: "2026-10-31T01:30:00.000Z",
  partySize: 4,
  status: "CONFIRMED",
  guestName: "Jane Doe",
  tableId: "t1",
  venueId: "venue-1",
} as unknown as Reservation;

function renderGrid(date: string, reservations: Reservation[] = [LATE_SEATING]) {
  return render(<TimelineGrid tables={[TABLE]} reservations={reservations} date={date} />);
}

describe("TimelineGrid now-line across venue midnight", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the now-line on the 24:45 position at 00:45 while the previous day's grid shows past-midnight columns", () => {
    vi.setSystemTime(new Date("2026-10-31T00:45:00Z"));
    renderGrid("2026-10-30");

    const nowLine = screen.getByTestId("now-line");
    expect(nowLine.style.left).toBe(`${TABLE_COLUMN_WIDTH + (24.75 - START_HOUR) * HOUR_WIDTH}px`);
  });

  it("scrolls to the past-midnight now-line on mount", () => {
    vi.setSystemTime(new Date("2026-10-31T00:45:00Z"));
    renderGrid("2026-10-30");

    const grid = screen.getByTestId("timeline-grid");
    // clientWidth is 0 in jsdom, so the scroll lands exactly on the line.
    expect(grid.scrollLeft).toBe(TABLE_COLUMN_WIDTH + (24.75 - START_HOUR) * HOUR_WIDTH);
  });

  it("shows no now-line on the previous day's grid once the night is over", () => {
    vi.setSystemTime(new Date("2026-10-31T10:00:00Z"));
    renderGrid("2026-10-30");
    expect(screen.queryByTestId("now-line")).toBeNull();
  });

  it("shows no now-line after midnight when the previous day's grid does not run past 24:00", () => {
    vi.setSystemTime(new Date("2026-10-31T00:45:00Z"));
    renderGrid("2026-10-30", []);
    expect(screen.queryByTestId("now-line")).toBeNull();
  });

  it("still places the now-line on today's grid in the daytime", () => {
    vi.setSystemTime(new Date("2026-10-30T19:30:00Z"));
    renderGrid("2026-10-30");

    const nowLine = screen.getByTestId("now-line");
    expect(nowLine.style.left).toBe(`${TABLE_COLUMN_WIDTH + (19.5 - START_HOUR) * HOUR_WIDTH}px`);
  });
});
