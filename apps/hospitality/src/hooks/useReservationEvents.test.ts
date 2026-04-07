import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReservationEvents } from "./useReservationEvents.js";
import type { ReservationEvent } from "./useReservationEvents.js";

/* ── Mock EventSource ──────────────────────────────────────────── */

type EventSourceListener = (event: MessageEvent) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, EventSourceListener[]>();
  readyState = 0;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventSourceListener): void {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(type, [...existing, listener]);
  }

  removeEventListener(type: string, listener: EventSourceListener): void {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      existing.filter((l) => l !== listener)
    );
  }

  close(): void {
    this.readyState = 2;
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  simulateError(): void {
    this.onerror?.();
  }

  simulateEvent(type: string, data: unknown): void {
    const listeners = this.listeners.get(type) ?? [];
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    for (const listener of listeners) {
      listener(event);
    }
  }
}

function latestEventSource(): MockEventSource {
  return MockEventSource.instances[MockEventSource.instances.length - 1];
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
  // The hook uses `import.meta.env.VITE_API_URL` which defaults to "" in tests.
  // `new URL("")` is invalid, so provide a base URL.
  vi.stubEnv("VITE_API_URL", "http://localhost:3000");
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useReservationEvents", () => {
  it("connects with the correct URL containing venueId", () => {
    renderHook(() =>
      useReservationEvents({ venueId: "venue-42" })
    );

    const es = latestEventSource();
    expect(es.url).toContain("/api/v1/events/stream");
    expect(es.url).toContain("venueId=venue-42");
  });

  it("sets isConnected to true on open", () => {
    const { result } = renderHook(() =>
      useReservationEvents({ venueId: "v1" })
    );

    expect(result.current.isConnected).toBe(false);

    act(() => {
      latestEventSource().simulateOpen();
    });

    expect(result.current.isConnected).toBe(true);
  });

  it("calls onReservationCreated when reservation:created event fires", () => {
    const onCreated = vi.fn();
    renderHook(() =>
      useReservationEvents({
        venueId: "v1",
        onReservationCreated: onCreated,
      })
    );

    const eventPayload: ReservationEvent = {
      type: "reservation:created",
      venueId: "v1",
      timestamp: "2026-01-01T00:00:00Z",
      data: {
        id: "res-1",
        date: "2026-01-01",
        startTime: "18:00",
        endTime: "20:00",
        partySize: 4,
        status: "CONFIRMED",
        notes: null,
        cancellationReason: null,
        cancellationNote: null,
        guestName: "Test",
        guestEmail: null,
        guestPhone: null,
        guestId: null,
        userId: null,
        tableId: "t1",
        venueId: "v1",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    };

    act(() => {
      latestEventSource().simulateEvent("reservation:created", eventPayload);
    });

    expect(onCreated).toHaveBeenCalledOnce();
    expect(onCreated).toHaveBeenCalledWith(eventPayload.data);
  });

  it("calls onReservationCancelled when reservation:cancelled event fires", () => {
    const onCancelled = vi.fn();
    renderHook(() =>
      useReservationEvents({
        venueId: "v1",
        onReservationCancelled: onCancelled,
      })
    );

    const eventPayload: ReservationEvent = {
      type: "reservation:cancelled",
      venueId: "v1",
      timestamp: "2026-01-01T00:00:00Z",
      data: {
        id: "res-2",
        date: "2026-01-01",
        startTime: "19:00",
        endTime: "21:00",
        partySize: 2,
        status: "CANCELLED",
        notes: null,
        cancellationReason: "guest_request",
        cancellationNote: null,
        guestName: "Jane",
        guestEmail: null,
        guestPhone: null,
        guestId: null,
        userId: null,
        tableId: "t2",
        venueId: "v1",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    };

    act(() => {
      latestEventSource().simulateEvent(
        "reservation:cancelled",
        eventPayload
      );
    });

    expect(onCancelled).toHaveBeenCalledOnce();
  });

  it("calls onTableUpdated when table:updated event fires", () => {
    const onTable = vi.fn();
    renderHook(() =>
      useReservationEvents({ venueId: "v1", onTableUpdated: onTable })
    );

    const eventPayload: ReservationEvent = {
      type: "table:updated",
      venueId: "v1",
      timestamp: "2026-01-01T00:00:00Z",
      data: {
        id: "t1",
        name: "Table 1",
        tableNumber: "1",
        capacity: 4,
        minCovers: 1,
        maxCovers: 4,
        location: null,
        isActive: true,
        priority: 1,
        status: "AVAILABLE",
        venueId: "v1",
        floorPlanId: null,
        shapeMetadata: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    };

    act(() => {
      latestEventSource().simulateEvent("table:updated", eventPayload);
    });

    expect(onTable).toHaveBeenCalledOnce();
    expect(onTable).toHaveBeenCalledWith(eventPayload.data);
  });

  it("sets error and calls onError on EventSource error", () => {
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useReservationEvents({ venueId: "v1", onError })
    );

    act(() => {
      latestEventSource().simulateOpen();
    });
    expect(result.current.isConnected).toBe(true);

    act(() => {
      latestEventSource().simulateError();
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("SSE connection error");
    expect(onError).toHaveBeenCalledOnce();
  });

  it("attempts reconnection with exponential backoff on error", () => {
    renderHook(() => useReservationEvents({ venueId: "v1" }));

    const initialCount = MockEventSource.instances.length;

    act(() => {
      latestEventSource().simulateError();
    });

    // First reconnect at 1000ms
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(MockEventSource.instances.length).toBe(initialCount + 1);

    // Second error -> reconnect at 2000ms
    act(() => {
      latestEventSource().simulateError();
    });

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(MockEventSource.instances.length).toBe(initialCount + 1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(MockEventSource.instances.length).toBe(initialCount + 2);
  });

  it("cleans up EventSource on unmount", () => {
    const { unmount } = renderHook(() =>
      useReservationEvents({ venueId: "v1" })
    );

    const es = latestEventSource();
    expect(es.readyState).not.toBe(2);

    unmount();

    expect(es.readyState).toBe(2);
  });

  it("does not connect when enabled is false", () => {
    const initialCount = MockEventSource.instances.length;

    renderHook(() =>
      useReservationEvents({ venueId: "v1", enabled: false })
    );

    expect(MockEventSource.instances.length).toBe(initialCount);
  });
});
