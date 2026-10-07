import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReservationEventEmitter, type ReservationEvent } from "./events.js";
import type { Reservation, Table } from "@mbe/types";

// ---------------------------------------------------------------------------
// Minimal fixture factories (only fields used by events.ts)
// ---------------------------------------------------------------------------

function makeReservation(overrides?: Partial<Reservation>): Reservation {
  return {
    id: "res-1",
    venueId: "venue-1",
    tableId: "table-1",
    guestId: null,
    guestName: "Alice",
    guestPhone: null,
    guestEmail: null,
    startTime: "2026-06-01T18:00:00.000Z",
    endTime: "2026-06-01T20:00:00.000Z",
    date: "2026-06-01",
    duration: 120,
    partySize: 2,
    status: "PENDING",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    confirmationCode: "ABC123",
    source: "online",
    userId: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(overrides as any),
  } as Reservation;
}

function makeTable(overrides?: Partial<Table>): Table {
  return {
    id: "table-1",
    venueId: "venue-1",
    name: "Table 1",
    tableNumber: "1",
    capacity: 4,
    minCovers: 1,
    maxCovers: null,
    location: null,
    isActive: true,
    priority: 0,
    status: "AVAILABLE",
    floorPlanId: null,
    shapeMetadata: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(overrides as any),
  } as Table;
}

// ---------------------------------------------------------------------------

describe("ReservationEventEmitter", () => {
  const reservationEvents = new ReservationEventEmitter();

  beforeEach(() => {
    // No shared state to reset — the emitter is stateless between emits.
    vi.clearAllMocks();
  });

  describe("getConnectionCount", () => {
    it("increments on onChange and decrements on offChange", () => {
      const before = reservationEvents.getConnectionCount();
      const listener = vi.fn();
      reservationEvents.onChange(listener);
      expect(reservationEvents.getConnectionCount()).toBe(before + 1);
      reservationEvents.offChange(listener);
      expect(reservationEvents.getConnectionCount()).toBe(before);
    });

    it("does not drop below 0 on extra offChange calls", () => {
      // Force count to 0 by unregistering a listener that was never registered
      const sentinel = vi.fn();
      // We cannot force count below 0 from outside, but we can verify
      // the Math.max(0, ...) guard holds.
      reservationEvents.offChange(sentinel);
      expect(reservationEvents.getConnectionCount()).toBeGreaterThanOrEqual(0);
    });
  });

  describe("emitChange / onChange", () => {
    it("delivers emitted events to registered listeners", async () => {
      const received: ReservationEvent[] = [];
      const listener = (e: ReservationEvent) => received.push(e);
      reservationEvents.onChange(listener);

      reservationEvents.emitChange({
        type: "reservation:created",
        venueId: "venue-1",
        timestamp: new Date().toISOString(),
        data: makeReservation(),
      });

      reservationEvents.offChange(listener);
      expect(received).toHaveLength(1);
      const [event] = received;
      if (!event) throw new Error("expected a received event");
      expect(event.type).toBe("reservation:created");
    });

    it("returns true when at least one listener is registered", () => {
      const listener = vi.fn();
      reservationEvents.onChange(listener);
      const result = reservationEvents.emitChange({
        type: "table:updated",
        venueId: "v1",
        timestamp: new Date().toISOString(),
        data: makeTable(),
      });
      reservationEvents.offChange(listener);
      expect(result).toBe(true);
    });

    it("warns to stderr when connection count approaches limit", () => {
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const listeners: Array<() => void> = [];

      // MAX_SSE_LISTENERS = 100, threshold = 80%  → warn at 80+ connections
      // Register enough to trip the warning (80 listeners)
      for (let i = 0; i < 80; i++) {
        const fn = vi.fn();
        listeners.push(fn);
        reservationEvents.onChange(fn);
      }

      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
      expect(output).toContain("WARNING");

      // Cleanup
      listeners.forEach((fn) => reservationEvents.offChange(fn as never));
      stderrSpy.mockRestore();
    });
  });
});
