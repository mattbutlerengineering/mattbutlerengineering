import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { TimelineGrid } from "./TimelineGrid.js";
import type { Table, Reservation } from "@mbe/types";

// Deliberately do NOT mock ReservationBlock here — this test exercises the real
// React.memo-wrapped component so a style-prop identity regression is observable.

// Mock matchMedia for useIsMobile hook
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

function makeTable(overrides: Partial<Table> = {}): Table {
  return {
    id: "table-1",
    name: "Table 1",
    tableNumber: "T1",
    capacity: 4,
    minCovers: 2,
    maxCovers: 4,
    location: null,
    isActive: true,
    priority: 1,
    status: "AVAILABLE",
    venueId: null,
    floorPlanId: null,
    shapeMetadata: null,
    createdAt: "2026-05-14T10:00:00.000Z",
    updatedAt: "2026-05-14T10:00:00.000Z",
    ...overrides,
  };
}

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res-1",
    date: "2026-05-14",
    startTime: "2026-05-14T18:00:00.000Z",
    endTime: "2026-05-14T20:00:00.000Z",
    partySize: 4,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Jane Doe",
    guestEmail: null,
    guestPhone: null,
    guestId: null,
    userId: null,
    tableId: "table-1",
    venueId: null,
    createdAt: "2026-05-14T10:00:00.000Z",
    updatedAt: "2026-05-14T10:00:00.000Z",
    ...overrides,
  };
}

describe("TimelineGrid + ReservationBlock style-prop stability", () => {
  it("does not re-render an unrelated ReservationBlock when TimelineGrid re-renders (e.g. selecting a different reservation)", () => {
    // Track how many times the real ReservationBlock body actually reads
    // `reservation.guestName` (used only inside ReservationBlockComponent's own
    // JSX — TimelineGrid.tsx itself never touches guestName, unlike `id`/
    // `startTime`/`endTime`, which TimelineGrid also reads for its own render
    // via `key`/`isSelected`/`computeReservationLayout`). React.memo's custom
    // arePropsEqual bailout skips the function body entirely on a real
    // bailout, so an incrementing getter here only fires on an actual
    // ReservationBlock re-render, not a TimelineGrid re-render.
    let renderCount = 0;
    const watchedReservation = makeReservation({ id: "res-1", tableId: "table-1" });
    Object.defineProperty(watchedReservation, "guestName", {
      get() {
        renderCount++;
        return "Jane Doe";
      },
    });

    const otherReservation = makeReservation({
      id: "res-2",
      tableId: "table-1",
      guestName: "John Smith",
      startTime: "2026-05-14T20:00:00.000Z",
      endTime: "2026-05-14T21:30:00.000Z",
    });

    const tables = [makeTable({ id: "table-1" })];
    const reservations = [watchedReservation, otherReservation];

    function Harness() {
      // A parent-level state change that touches only `otherReservation`'s
      // selection — the watched reservation's own data is untouched.
      const [selectedId, setSelectedId] = useState<string | null>(null);
      return (
        <>
          <button data-testid="select-other" onClick={() => setSelectedId("res-2")}>
            select other
          </button>
          <TimelineGrid
            tables={tables}
            reservations={reservations}
            date="2026-05-14"
            selectedReservationId={selectedId}
          />
        </>
      );
    }

    render(<Harness />);
    expect(renderCount).toBeGreaterThan(0);
    const countAfterMount = renderCount;

    fireEvent.click(screen.getByTestId("select-other"));

    expect(renderCount).toBe(countAfterMount);
  });

  it("does not re-render ReservationBlock on the periodic currentTime clock tick", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-14T18:05:00.000Z"));

    let renderCount = 0;
    const watchedReservation = makeReservation({ id: "res-1", tableId: "table-1" });
    Object.defineProperty(watchedReservation, "guestName", {
      get() {
        renderCount++;
        return "Jane Doe";
      },
    });

    const tables = [makeTable({ id: "table-1" })];
    const reservations = [watchedReservation];

    render(<TimelineGrid tables={tables} reservations={reservations} date="2026-05-14" />);
    expect(renderCount).toBeGreaterThan(0);
    const countAfterMount = renderCount;

    // Advance past a minute boundary and let the 10s poll interval notice.
    vi.setSystemTime(new Date("2026-05-14T18:06:05.000Z"));
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(renderCount).toBe(countAfterMount);

    vi.useRealTimers();
  });
});
