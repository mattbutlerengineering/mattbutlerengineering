process.env.TZ = "UTC";

import { describe, it, expect, vi } from "vitest";
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
const TABLE = { id: "t1", name: "Table 1", capacity: 4, status: "AVAILABLE" } as unknown as Table;

function reservation(startTime: string, endTime: string): Reservation {
  return {
    id: "res-1",
    date: "2026-05-14",
    startTime,
    endTime,
    partySize: 4,
    status: "CONFIRMED",
    guestName: "Jane Doe",
    tableId: "t1",
    venueId: "venue-1",
  } as unknown as Reservation;
}

function renderGrid(res: Reservation[]) {
  return render(<TimelineGrid tables={[TABLE]} reservations={res} date="2026-05-14" />);
}

describe("TimelineGrid past midnight", () => {
  it("extends the hour columns so a 23:30-01:30 seating sits inside them, with a 1 AM header", () => {
    renderGrid([reservation("2026-05-14T23:30:00.000Z", "2026-05-15T01:30:00.000Z")]);

    // First columnheader is the tables column.
    const headers = screen.getAllByRole("columnheader").slice(1);
    expect(headers.map((h) => h.textContent)).toContain("1 AM");
    // 11 AM through 1 AM next morning, inclusive.
    expect(headers).toHaveLength(15);

    const block = screen.getByTestId("reservation-block-res-1");
    const left = parseFloat(block.style.left);
    const width = parseFloat(block.style.width);
    expect(left + width).toBeLessThanOrEqual(headers.length * HOUR_WIDTH);
  });

  it("keeps the default 11 AM-11 PM columns when every seating ends by midnight", () => {
    renderGrid([reservation("2026-05-14T18:00:00.000Z", "2026-05-14T20:00:00.000Z")]);
    expect(screen.getAllByRole("columnheader").slice(1)).toHaveLength(13);
  });
});
