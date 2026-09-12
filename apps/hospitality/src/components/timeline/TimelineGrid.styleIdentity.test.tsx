import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { TimelineGrid } from "./TimelineGrid.js";
import type { Table, Reservation } from "@mbe/types";

// Capture every `style` prop object ReservationBlock is called with, keyed by
// reservation id, so we can assert object identity (===) across re-renders —
// a value-based equality check (as used by ReservationBlock's own memo
// comparator) can't detect a wasted re-allocation of an otherwise-identical
// object, but reference equality can.
const capturedStyles: Record<string, { left: number; width: number }[]> = {};

vi.mock("./ReservationBlock.js", () => ({
  ReservationBlock: ({
    reservation,
    style,
  }: {
    reservation: Reservation;
    style: { left: number; width: number };
  }) => {
    (capturedStyles[reservation.id] ??= []).push(style);
    return <button data-testid={`reservation-${reservation.id}`}>{reservation.guestName}</button>;
  },
}));

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

describe("TimelineGrid reservation style prop identity", () => {
  it("passes the same style object reference to ReservationBlock across an unrelated re-render", () => {
    const tables = [makeTable({ id: "table-1" })];
    const reservations = [
      makeReservation({ id: "res-1", tableId: "table-1" }),
      makeReservation({
        id: "res-2",
        tableId: "table-1",
        guestName: "John Smith",
        startTime: "2026-05-14T20:00:00.000Z",
        endTime: "2026-05-14T21:30:00.000Z",
      }),
    ];

    const { rerender } = render(
      <TimelineGrid
        tables={tables}
        reservations={reservations}
        date="2026-05-14"
        selectedReservationId={null}
      />
    );

    expect(capturedStyles["res-1"]).toHaveLength(1);
    const styleAfterMount = capturedStyles["res-1"]![0];

    // Re-render caused by selecting a *different* reservation — res-1's own
    // start/end time and the grid layout inputs are unchanged.
    rerender(
      <TimelineGrid
        tables={tables}
        reservations={reservations}
        date="2026-05-14"
        selectedReservationId="res-2"
      />
    );

    expect(capturedStyles["res-1"]).toHaveLength(2);
    const styleAfterRerender = capturedStyles["res-1"]![1];

    expect(styleAfterRerender).toBe(styleAfterMount);
  });
});
