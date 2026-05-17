import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  reservationEvents,
  emitReservationCreated,
  emitReservationUpdated,
  emitReservationCancelled,
  emitHoldCreated,
  emitHoldReleased,
  emitHoldConfirmed,
  emitTableUpdated,
  emitFloorPlanCreated,
  type ReservationEvent,
} from "./events.js";
import type { Reservation, Table, ReservationHold, FloorPlan } from "@mbe/types";

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

function makeHold(overrides?: Partial<ReservationHold>): ReservationHold {
  return {
    id: "hold-1",
    venueId: "venue-1",
    tableId: "table-1",
    guestName: "Bob",
    partySize: 2,
    startTime: "2026-06-01T18:00:00.000Z",
    endTime: "2026-06-01T20:00:00.000Z",
    date: "2026-06-01",
    expiresAt: "2026-06-01T18:05:00.000Z",
    status: "ACTIVE",
    sessionId: "sess-1",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(overrides as any),
  } as ReservationHold;
}

function makeFloorPlan(overrides?: Partial<FloorPlan>): FloorPlan {
  return {
    id: "fp-1",
    venueId: "venue-1",
    name: "Main Floor",
    isActive: true,
    tables: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(overrides as any),
  } as FloorPlan;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function captureNextEvent(): Promise<ReservationEvent> {
  return new Promise((resolve) => {
    const listener = (event: ReservationEvent) => {
      reservationEvents.offChange(listener);
      resolve(event);
    };
    reservationEvents.onChange(listener);
  });
}

// ---------------------------------------------------------------------------

describe("ReservationEventEmitter", () => {
  beforeEach(() => {
    // No shared state to reset — the singleton is stateless between emits.
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
      expect(received[0].type).toBe("reservation:created");
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

// ---------------------------------------------------------------------------

describe("emit helper functions", () => {
  describe("emitReservationCreated", () => {
    it("emits reservation:created with correct venueId and data", async () => {
      const nextEvent = captureNextEvent();
      const reservation = makeReservation({ venueId: "venue-42" });
      emitReservationCreated(reservation);
      const event = await nextEvent;
      expect(event.type).toBe("reservation:created");
      expect(event.venueId).toBe("venue-42");
      expect(event.data).toBe(reservation);
    });

    it("falls back to empty string venueId when reservation.venueId is null", async () => {
      const nextEvent = captureNextEvent();
      emitReservationCreated(makeReservation({ venueId: undefined }));
      const event = await nextEvent;
      expect(event.venueId).toBe("");
    });

    it("timestamp is a valid ISO string", async () => {
      const nextEvent = captureNextEvent();
      emitReservationCreated(makeReservation());
      const event = await nextEvent;
      expect(() => new Date(event.timestamp)).not.toThrow();
      expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
    });
  });

  describe("emitReservationUpdated", () => {
    it("emits reservation:updated type", async () => {
      const nextEvent = captureNextEvent();
      emitReservationUpdated(makeReservation({ venueId: "venue-1" }));
      const event = await nextEvent;
      expect(event.type).toBe("reservation:updated");
    });
  });

  describe("emitReservationCancelled", () => {
    it("emits reservation:cancelled type", async () => {
      const nextEvent = captureNextEvent();
      emitReservationCancelled(makeReservation({ venueId: "venue-1" }));
      const event = await nextEvent;
      expect(event.type).toBe("reservation:cancelled");
    });
  });

  describe("emitHoldCreated", () => {
    it("emits hold:created with hold venueId", async () => {
      const nextEvent = captureNextEvent();
      const hold = makeHold({ venueId: "venue-99" });
      emitHoldCreated(hold);
      const event = await nextEvent;
      expect(event.type).toBe("hold:created");
      expect(event.venueId).toBe("venue-99");
      expect(event.data).toBe(hold);
    });
  });

  describe("emitHoldReleased", () => {
    it("emits hold:released type", async () => {
      const nextEvent = captureNextEvent();
      emitHoldReleased(makeHold({ venueId: "venue-1" }));
      const event = await nextEvent;
      expect(event.type).toBe("hold:released");
    });
  });

  describe("emitHoldConfirmed", () => {
    it("emits hold:confirmed with reservation venueId", async () => {
      const nextEvent = captureNextEvent();
      const reservation = makeReservation({ venueId: "venue-55" });
      emitHoldConfirmed(reservation);
      const event = await nextEvent;
      expect(event.type).toBe("hold:confirmed");
      expect(event.venueId).toBe("venue-55");
    });
  });

  describe("emitTableUpdated", () => {
    it("emits table:updated with table venueId", async () => {
      const nextEvent = captureNextEvent();
      const table = makeTable({ venueId: "venue-77" });
      emitTableUpdated(table);
      const event = await nextEvent;
      expect(event.type).toBe("table:updated");
      expect(event.venueId).toBe("venue-77");
      expect(event.data).toBe(table);
    });

    it("falls back to empty string when table.venueId is null", async () => {
      const nextEvent = captureNextEvent();
      emitTableUpdated(makeTable({ venueId: undefined }));
      const event = await nextEvent;
      expect(event.venueId).toBe("");
    });
  });

  describe("emitFloorPlanCreated", () => {
    it("emits floor-plan:created with floor plan venueId", async () => {
      const nextEvent = captureNextEvent();
      const fp = makeFloorPlan({ venueId: "venue-88" });
      emitFloorPlanCreated(fp);
      const event = await nextEvent;
      expect(event.type).toBe("floor-plan:created");
      expect(event.venueId).toBe("venue-88");
      expect(event.data).toBe(fp);
    });
  });
});
