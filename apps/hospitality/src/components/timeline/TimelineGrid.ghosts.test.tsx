import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { AutopilotMove, Reservation, Table } from "@mbe/types";
import { TimelineGrid } from "./TimelineGrid.js";

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

const tables = [
  { id: "t1", name: "Table 1", capacity: 4, minCovers: 1, status: "AVAILABLE" },
  { id: "t2", name: "Table 2", capacity: 2, minCovers: 1, status: "AVAILABLE" },
] as unknown as Table[];

const booking = {
  id: "res-1",
  date: "2026-05-14",
  startTime: "2026-05-15T01:00:00.000Z",
  endTime: "2026-05-15T03:00:00.000Z",
  partySize: 2,
  status: "CONFIRMED",
  guestName: "Real Booking",
  tableId: "t1",
  venueId: "venue-1",
} as unknown as Reservation;

const ghost: AutopilotMove = {
  id: "reseat:res-1>t2",
  kind: "reseat",
  partyLabel: "Ana",
  partySize: 2,
  fromTableId: "t1",
  fromTableName: "Table 1",
  toTableId: "t2",
  toTableName: "Table 2",
  startTime: "2026-05-15T01:00:00.000Z",
  endTime: "2026-05-15T03:00:00.000Z",
  reason: "r",
};

describe("TimelineGrid ghost blocks", () => {
  it("draws a suggested move in the target table's row, hidden from assistive tech", () => {
    render(
      <TimelineGrid tables={tables} reservations={[booking]} date="2026-05-14" ghosts={[ghost]} />
    );

    const row = screen.getByTestId("table-row-t2");
    const block = within(row).getByTestId("autopilot-ghost");
    expect(block.getAttribute("aria-hidden")).toBe("true");
    expect(block.textContent).toContain("Ana");
    expect(within(screen.getByTestId("table-row-t1")).queryByTestId("autopilot-ghost")).toBeNull();
  });

  it("is never focusable or clickable like a booking", () => {
    render(
      <TimelineGrid tables={tables} reservations={[booking]} date="2026-05-14" ghosts={[ghost]} />
    );
    const block = screen.getByTestId("autopilot-ghost");
    expect(block.tagName).not.toBe("BUTTON");
    expect(block.hasAttribute("tabindex")).toBe(false);
    expect(screen.getAllByRole("button", { name: /Real Booking/ })).toHaveLength(1);
  });

  it("draws nothing without ghosts", () => {
    render(<TimelineGrid tables={tables} reservations={[booking]} date="2026-05-14" />);
    expect(screen.queryByTestId("autopilot-ghost")).toBeNull();
  });
});
