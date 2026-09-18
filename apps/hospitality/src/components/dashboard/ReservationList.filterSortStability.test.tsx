import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReservationList } from "./ReservationList.js";
import type { Reservation } from "@mbe/types";

// Deliberately do NOT mock ReservationList's own filter/sort inputs here —
// this test exercises the real React.memo-wrapped component so a
// filter/sort-recompute regression (like #3520's TimelineGrid/ReservationBlock
// bug) is observable.

vi.mock("@mattbutlerengineering/rialto", () => ({
  Card: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-testid="card" data-title={title}>
      {children}
    </div>
  ),
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Badge: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Skeleton: () => <div data-testid="skeleton" />,
}));

const mockReservation = (overrides: Partial<Reservation> = {}): Reservation => ({
  id: "res-1",
  venueId: "venue-1",
  guestName: "John Doe",
  startTime: "18:00",
  partySize: 4,
  status: "CONFIRMED",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
  ...overrides,
});

describe("ReservationList filter/sort stability", () => {
  it("does not re-run filter/sort when the parent re-renders with the same reservations reference (e.g. an unrelated SSE event or clock tick)", () => {
    // Track how many times `status` is read — the filter predicate reads it
    // on every invocation, so an incrementing getter only advances when the
    // filter (and therefore the whole computation) actually re-runs.
    let statusReadCount = 0;
    const watched = mockReservation({ id: "res-1" });
    Object.defineProperty(watched, "status", {
      get() {
        statusReadCount++;
        return "CONFIRMED";
      },
    });

    const reservations = [watched];

    function Harness() {
      // Simulates an unrelated SSE event / clock tick re-render: parent state
      // changes, but the `reservations`/`isLoading` props passed down stay
      // referentially identical.
      const [tick, setTick] = useState(0);
      return (
        <>
          <button data-testid="tick" onClick={() => setTick((t) => t + 1)}>
            tick {tick}
          </button>
          <ReservationList reservations={reservations} isLoading={false} />
        </>
      );
    }

    render(<Harness />);
    expect(statusReadCount).toBeGreaterThan(0);
    const countAfterMount = statusReadCount;

    fireEvent.click(screen.getByTestId("tick"));

    expect(statusReadCount).toBe(countAfterMount);
  });
});
