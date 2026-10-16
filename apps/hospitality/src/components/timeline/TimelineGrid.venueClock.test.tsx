// The viewer's device is in New York; the venue is in Los Angeles. Everything on the grid
// (block position, hour columns, now-line position, and every label) must read the venue clock.
process.env.TZ = "America/New_York";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Reservation, Table } from "@mbe/types";
import { TimelineGrid } from "./TimelineGrid.js";
import { TimelineMobileView } from "./TimelineMobileView.js";
import { computeReservationLayout } from "./reservationLayout.js";

vi.mock("../../contexts/venue-context-object.js", () => ({
  useOptionalVenue: () => ({
    selectedVenue: { ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
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
// 2026-05-15T02:00Z is 22:00 in New York but 19:00 (7 PM) on 2026-05-14 in Los Angeles.
const LA_EVENING = "2026-05-15T02:00:00.000Z";

const TABLE = { id: "t1", name: "Table 1", capacity: 4, status: "AVAILABLE" } as unknown as Table;

function reservation(): Reservation {
  return {
    id: "res-1",
    date: "2026-05-14",
    startTime: LA_EVENING,
    endTime: "2026-05-15T04:00:00.000Z",
    partySize: 4,
    status: "CONFIRMED",
    guestName: "Jane Doe",
    tableId: "t1",
    venueId: "venue-1",
  } as unknown as Reservation;
}

describe("computeReservationLayout on the venue clock", () => {
  it("places a 02:00Z reservation in the 7 PM column for an LA venue, whatever the device zone", () => {
    const { left } = computeReservationLayout(LA_EVENING, "2026-05-15T04:00:00.000Z", {
      startHour: START_HOUR,
      hourWidth: HOUR_WIDTH,
      isMobile: false,
      timeZone: "America/Los_Angeles",
    });
    expect(left).toBe((19 - START_HOUR) * HOUR_WIDTH);
  });
});

describe("TimelineMobileView on the venue clock", () => {
  it("groups the reservation under the venue's 7:00 PM slot", () => {
    render(
      <TimelineMobileView
        reservations={[reservation()]}
        tables={[TABLE]}
        onReservationClick={() => undefined}
      />
    );
    expect(screen.getAllByText("7:00 PM").length).toBeGreaterThan(0);
    expect(screen.queryByText("10:00 PM")).toBeNull();
  });
});

describe("TimelineGrid with a venue zone that differs from the device's", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("positions the block in the 7 PM column and labels it 7:00 PM", () => {
    vi.setSystemTime(new Date("2026-05-15T20:00:00Z"));
    render(<TimelineGrid tables={[TABLE]} reservations={[reservation()]} date="2026-05-14" />);

    const block = screen.getByTestId("reservation-block-res-1");
    expect(block.style.left).toBe(`${(19 - START_HOUR) * HOUR_WIDTH}px`);
    expect(block.textContent).toContain("7:00 PM");
  });

  it("puts the now-line at the venue time and labels it with the same time", () => {
    // 02:30Z is 7:30 PM on 2026-05-14 in Los Angeles (10:30 PM in New York).
    vi.setSystemTime(new Date("2026-05-15T02:30:00Z"));
    render(<TimelineGrid tables={[TABLE]} reservations={[]} date="2026-05-14" />);

    const nowLine = screen.getByTestId("now-line");
    expect(nowLine.style.left).toBe(`${TABLE_COLUMN_WIDTH + (19.5 - START_HOUR) * HOUR_WIDTH}px`);
    expect(nowLine.textContent).toContain("7:30 PM");
  });
});
