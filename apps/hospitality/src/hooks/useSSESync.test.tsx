import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import { SSESyncProvider, useSSESync, useSSEStatus, useSSEEventFeed } from "./useSSESync.js";

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

vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: () => ({ selectedVenueId: "v1" }),
}));

/* ── Wrappers ──────────────────────────────────────────────────── */

function makeWrapper(queryClient?: QueryClient) {
  const qc = queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: qc },
      createElement(ToastProvider, null, createElement(SSESyncProvider, null, children))
    );
  };
}

/* ── Setup ─────────────────────────────────────────────────────── */

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
  vi.stubEnv("VITE_API_URL", "http://localhost:3000");
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* ── Tests ─────────────────────────────────────────────────────── */

describe("useSSESync — EventSource lifecycle", () => {
  it("connects with venueId in URL", () => {
    renderHook(() => useSSESync(), { wrapper: makeWrapper() });

    const es = latestEventSource();
    expect(es.url).toContain("/api/v1/events/stream");
    expect(es.url).toContain("venueId=v1");
  });

  it("closes EventSource on unmount", () => {
    const { unmount } = renderHook(() => useSSESync(), { wrapper: makeWrapper() });
    const es = latestEventSource();
    expect(es.readyState).not.toBe(2);
    unmount();
    expect(es.readyState).toBe(2);
  });
});

describe("useSSEStatus — connection status via context", () => {
  it("starts disconnected", () => {
    const { result } = renderHook(() => useSSEStatus(), { wrapper: makeWrapper() });
    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("reports connected after open", () => {
    // useSSESync creates the EventSource; useSSEStatus reads from shared context
    const { result } = renderHook(() => ({ status: useSSEStatus(), sync: useSSESync() }), {
      wrapper: makeWrapper(),
    });

    act(() => {
      latestEventSource().simulateOpen();
    });

    expect(result.current.status.isConnected).toBe(true);
    expect(result.current.status.error).toBeNull();
  });

  it("reports error after SSE error", () => {
    const { result } = renderHook(() => ({ status: useSSEStatus(), sync: useSSESync() }), {
      wrapper: makeWrapper(),
    });

    act(() => {
      latestEventSource().simulateOpen();
    });
    act(() => {
      latestEventSource().simulateError();
    });

    expect(result.current.status.isConnected).toBe(false);
    expect(result.current.status.error).toBeInstanceOf(Error);
    expect(result.current.status.error?.message).toBe("SSE connection error");
  });
});

describe("useSSESync — connect → event → invalidate flow", () => {
  it("invalidates reservations query on reservation:created", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    renderHook(() => useSSESync(), { wrapper: makeWrapper(qc) });

    act(() => {
      latestEventSource().simulateOpen();
    });

    act(() => {
      latestEventSource().simulateEvent("reservation:created", {
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
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["reservations"] })
    );
  });

  it("invalidates tables query on table:updated", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    renderHook(() => useSSESync(), { wrapper: makeWrapper(qc) });

    act(() => {
      latestEventSource().simulateEvent("table:updated", {
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
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["tables"] }));
  });
});

describe("useSSESync — disconnect → reconnect with backoff", () => {
  it("schedules reconnect after error", () => {
    const initialCount = MockEventSource.instances.length;
    renderHook(() => useSSESync(), { wrapper: makeWrapper() });

    act(() => {
      latestEventSource().simulateError();
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(MockEventSource.instances.length).toBe(initialCount + 2);
  });

  it("doubles backoff delay on consecutive errors", () => {
    const initialCount = MockEventSource.instances.length;
    renderHook(() => useSSESync(), { wrapper: makeWrapper() });

    // First error → reconnects at 1000ms
    act(() => {
      latestEventSource().simulateError();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(MockEventSource.instances.length).toBe(initialCount + 2);

    // Second error → reconnects at 2000ms
    act(() => {
      latestEventSource().simulateError();
    });
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(MockEventSource.instances.length).toBe(initialCount + 2);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(MockEventSource.instances.length).toBe(initialCount + 3);
  });

  it("closes EventSource on error immediately (no browser auto-reconnect)", () => {
    renderHook(() => useSSESync(), { wrapper: makeWrapper() });

    const es = latestEventSource();
    act(() => {
      es.simulateError();
    });

    expect(es.readyState).toBe(2);
  });

  it("applies 60s cooldown after many consecutive failures", () => {
    renderHook(() => useSSESync(), { wrapper: makeWrapper() });

    for (let i = 0; i < 8; i++) {
      act(() => {
        latestEventSource().simulateError();
      });
      act(() => {
        vi.advanceTimersByTime(30_001);
      });
    }

    const countBefore = MockEventSource.instances.length;

    act(() => {
      latestEventSource().simulateError();
    });

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(MockEventSource.instances.length).toBe(countBefore);

    act(() => {
      vi.advanceTimersByTime(30_001);
    });
    expect(MockEventSource.instances.length).toBe(countBefore + 1);
  });
});

describe("useSSEEventFeed — event feed via context", () => {
  it("receives broadcasted events", () => {
    // Render both useSSESync (creates the EventSource) and useSSEEventFeed together
    const { result } = renderHook(() => ({ feed: useSSEEventFeed(), sync: useSSESync() }), {
      wrapper: makeWrapper(),
    });
    expect(result.current.feed).toHaveLength(0);

    act(() => {
      latestEventSource().simulateEvent("reservation:created", {
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
      });
    });

    expect(result.current.feed).toHaveLength(1);
    expect(result.current.feed[0]?.type).toBe("reservation:created");
  });

  it("caps events at maxItems", () => {
    const { result } = renderHook(
      () => ({ feed: useSSEEventFeed({ maxItems: 2 }), sync: useSSESync() }),
      { wrapper: makeWrapper() }
    );

    for (let i = 0; i < 3; i++) {
      act(() => {
        latestEventSource().simulateEvent("reservation:updated", {
          type: "reservation:updated",
          venueId: "v1",
          timestamp: `2026-01-01T00:00:0${i}Z`,
          data: {
            id: `res-${i}`,
            date: "2026-01-01",
            startTime: "18:00",
            endTime: "20:00",
            partySize: 2,
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
        });
      });
    }

    expect(result.current.feed).toHaveLength(2);
  });
});
