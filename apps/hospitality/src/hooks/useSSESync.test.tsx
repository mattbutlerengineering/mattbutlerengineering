import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import { useAuth } from "@mbe/auth/react";
import {
  SSESyncProvider,
  useSSESync,
  useSSEStatus,
  useSSEEventFeed,
  useTableStatuses,
} from "./useSSESync.js";

/* ── Fake fetchEventSource ─────────────────────────────────────────
 *
 * useSSESync builds a real SseClient, which calls fetchEventSource once per
 * connection attempt and owns reconnect/backoff scheduling itself. The fake
 * never auto-retries — tests drive onopen/onmessage/onerror directly.
 */

interface FakeCall {
  url: string;
  headers: Record<string, string>;
  aborted: boolean;
  onopen: (response: Response) => Promise<void>;
  onmessage: (ev: { event: string; data: string; id: string }) => void;
  onerror: (err: unknown) => unknown;
}

const fakeCalls: FakeCall[] = [];

vi.mock("@microsoft/fetch-event-source", () => ({
  fetchEventSource: (url: string, init: Record<string, unknown>) => {
    const call: FakeCall = {
      url,
      headers: (init.headers as Record<string, string>) ?? {},
      aborted: false,
      onopen: init.onopen as FakeCall["onopen"],
      onmessage: init.onmessage as FakeCall["onmessage"],
      onerror: init.onerror as FakeCall["onerror"],
    };
    fakeCalls.push(call);
    const signal = init.signal as AbortSignal | undefined;
    signal?.addEventListener("abort", () => {
      call.aborted = true;
    });
    return new Promise<void>(() => {
      /* never resolves in tests — lifecycle is driven via onopen/onerror */
    });
  },
}));

vi.mock("@mbe/auth/react", () => ({
  useAuth: vi.fn(),
}));

function latest(): FakeCall {
  return fakeCalls[fakeCalls.length - 1];
}

function okResponse(): Response {
  return new Response(null, { status: 200, headers: { "content-type": "text/event-stream" } });
}

async function simulateOpen(): Promise<void> {
  await latest().onopen(okResponse());
}

function simulateError(): void {
  try {
    latest().onerror(new Error("SSE connection error"));
  } catch {
    // SseClient's onerror handler intentionally throws to stop fetchEventSource's
    // own internal auto-retry loop — SseClient owns backoff scheduling instead.
  }
}

function simulateEvent(type: string, data: unknown): void {
  latest().onmessage({ event: type, data: JSON.stringify(data), id: "" });
}

vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: () => ({ selectedVenueId: "v1" }),
}));

const mockGetStatuses = vi.fn();
// Stable reference across renders — mirrors useApiClient()'s real useMemo
// (keyed on accessToken). A fresh object per call would re-trigger any
// effect keyed on `api`.
const mockApiClient = { tables: { getStatuses: mockGetStatuses } };
vi.mock("./useApiClient.js", () => ({
  useApiClient: () => mockApiClient,
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
  fakeCalls.length = 0;
  vi.mocked(useAuth).mockReturnValue({ accessToken: "test-access-token" } as never);
  vi.stubEnv("VITE_API_URL", "http://localhost:3000");
  vi.useFakeTimers();
  mockGetStatuses.mockReset();
  mockGetStatuses.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* ── Tests ─────────────────────────────────────────────────────── */

describe("useSSESync — connection lifecycle", () => {
  it("connects with venueId in URL", () => {
    renderHook(() => useSSESync(), { wrapper: makeWrapper() });

    expect(latest().url).toContain("/api/v1/events/stream");
    expect(latest().url).toContain("venueId=v1");
  });

  it("attaches the access token as an Authorization header", () => {
    renderHook(() => useSSESync(), { wrapper: makeWrapper() });

    expect(latest().headers.Authorization).toBe("Bearer test-access-token");
  });

  it("aborts the connection on unmount", () => {
    const { unmount } = renderHook(() => useSSESync(), { wrapper: makeWrapper() });
    const call = latest();
    expect(call.aborted).toBe(false);
    unmount();
    expect(call.aborted).toBe(true);
  });
});

describe("useSSEStatus — connection status via context", () => {
  it("starts disconnected", () => {
    const { result } = renderHook(() => useSSEStatus(), { wrapper: makeWrapper() });
    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("reports connected after open", () => {
    // useSSESync creates the connection; useSSEStatus reads from shared context
    const { result } = renderHook(() => ({ status: useSSEStatus(), sync: useSSESync() }), {
      wrapper: makeWrapper(),
    });

    act(() => {
      void simulateOpen();
    });

    expect(result.current.status.isConnected).toBe(true);
    expect(result.current.status.error).toBeNull();
  });

  it("reports error after SSE error", () => {
    const { result } = renderHook(() => ({ status: useSSEStatus(), sync: useSSESync() }), {
      wrapper: makeWrapper(),
    });

    act(() => {
      void simulateOpen();
    });
    act(() => {
      simulateError();
    });

    expect(result.current.status.isConnected).toBe(false);
    expect(result.current.status.error).toBeInstanceOf(Error);
    expect(result.current.status.error?.message).toBe("SSE connection error");
  });

  it("reports connected again — and clears the error — once the scheduled reconnect opens", () => {
    // Drives the floor plan canvas's staleness indicator: it derives
    // isStale from !isConnected, so this is the exact round trip that
    // must clear it (see FloorPlanCanvas's `isStale` prop).
    const { result } = renderHook(() => ({ status: useSSEStatus(), sync: useSSESync() }), {
      wrapper: makeWrapper(),
    });

    act(() => {
      void simulateOpen();
    });
    act(() => {
      simulateError();
    });
    expect(result.current.status.isConnected).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1000); // scheduled reconnect attempt opens a new connection
    });
    act(() => {
      void simulateOpen();
    });

    expect(result.current.status.isConnected).toBe(true);
    expect(result.current.status.error).toBeNull();
  });
});

describe("useSSESync — connect → event → invalidate flow", () => {
  it("invalidates reservations query on reservation:created", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    renderHook(() => useSSESync(), { wrapper: makeWrapper(qc) });

    act(() => {
      void simulateOpen();
    });

    act(() => {
      simulateEvent("reservation:created", {
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
      simulateEvent("table:updated", {
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

  it("invalidates venues query on venue:updated", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    renderHook(() => useSSESync(), { wrapper: makeWrapper(qc) });

    act(() => {
      simulateEvent("venue:updated", {
        type: "venue:updated",
        venueId: "v1",
        timestamp: "2026-01-01T00:00:00Z",
        data: { id: "v1", name: "Renamed Venue" },
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["venues"] }));
  });
});

describe("useSSESync — disconnect → reconnect with backoff", () => {
  it("schedules reconnect after error", () => {
    const initialCount = fakeCalls.length;
    renderHook(() => useSSESync(), { wrapper: makeWrapper() });

    act(() => {
      simulateError();
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(fakeCalls.length).toBe(initialCount + 2);
  });

  it("doubles backoff delay on consecutive errors", () => {
    const initialCount = fakeCalls.length;
    renderHook(() => useSSESync(), { wrapper: makeWrapper() });

    // First error → reconnects at 1000ms
    act(() => {
      simulateError();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(fakeCalls.length).toBe(initialCount + 2);

    // Second error → reconnects at 2000ms
    act(() => {
      simulateError();
    });
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(fakeCalls.length).toBe(initialCount + 2);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(fakeCalls.length).toBe(initialCount + 3);
  });

  it("aborts the in-flight request on error (no browser auto-reconnect)", () => {
    renderHook(() => useSSESync(), { wrapper: makeWrapper() });

    const call = latest();
    act(() => {
      simulateError();
    });

    expect(call.aborted).toBe(false); // erroring doesn't abort — it's already failed
  });

  it("applies 60s cooldown after many consecutive failures", () => {
    renderHook(() => useSSESync(), { wrapper: makeWrapper() });

    for (let i = 0; i < 8; i++) {
      act(() => {
        simulateError();
      });
      act(() => {
        vi.advanceTimersByTime(30_001);
      });
    }

    const countBefore = fakeCalls.length;

    act(() => {
      simulateError();
    });

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(fakeCalls.length).toBe(countBefore);

    act(() => {
      vi.advanceTimersByTime(30_001);
    });
    expect(fakeCalls.length).toBe(countBefore + 1);
  });
});

describe("useSSEEventFeed — event feed via context", () => {
  it("receives broadcasted events", () => {
    // Render both useSSESync (creates the connection) and useSSEEventFeed together
    const { result } = renderHook(() => ({ feed: useSSEEventFeed(), sync: useSSESync() }), {
      wrapper: makeWrapper(),
    });
    expect(result.current.feed).toHaveLength(0);

    act(() => {
      simulateEvent("reservation:created", {
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
        simulateEvent("reservation:updated", {
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

  it("receives table-status:changed deltas with changed tables only", () => {
    const { result } = renderHook(() => ({ feed: useSSEEventFeed(), sync: useSSESync() }), {
      wrapper: makeWrapper(),
    });

    act(() => {
      simulateEvent("table-status:changed", {
        type: "table-status:changed",
        venueId: "v1",
        timestamp: "2026-01-01T00:00:00Z",
        data: [{ tableId: "t1", status: "seated" }],
      });
    });

    expect(result.current.feed).toHaveLength(1);
    expect(result.current.feed[0]?.type).toBe("table-status:changed");
    expect(result.current.feed[0]?.data).toEqual([{ tableId: "t1", status: "seated" }]);
  });
});

describe("useTableStatuses — cumulative per-table status via context", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => ({ tableStatuses: useTableStatuses(), sync: useSSESync() }), {
      wrapper: makeWrapper(),
    });

    expect(result.current.tableStatuses.statuses.size).toBe(0);
  });

  it("records a table's status from a table-status:changed delta", () => {
    const { result } = renderHook(() => ({ tableStatuses: useTableStatuses(), sync: useSSESync() }), {
      wrapper: makeWrapper(),
    });

    act(() => {
      simulateEvent("table-status:changed", {
        type: "table-status:changed",
        venueId: "v1",
        timestamp: "2026-01-01T00:00:00Z",
        data: [{ tableId: "t1", status: "seated" }],
      });
    });

    expect(result.current.tableStatuses.statuses.get("t1")).toBe("seated");
  });

  it("accumulates deltas for multiple tables across events", () => {
    const { result } = renderHook(() => ({ tableStatuses: useTableStatuses(), sync: useSSESync() }), {
      wrapper: makeWrapper(),
    });

    act(() => {
      simulateEvent("table-status:changed", {
        type: "table-status:changed",
        venueId: "v1",
        timestamp: "2026-01-01T00:00:00Z",
        data: [{ tableId: "t1", status: "seated" }],
      });
    });
    act(() => {
      simulateEvent("table-status:changed", {
        type: "table-status:changed",
        venueId: "v1",
        timestamp: "2026-01-01T00:00:01Z",
        data: [{ tableId: "t2", status: "needs-bussing" }],
      });
    });

    expect(result.current.tableStatuses.statuses.get("t1")).toBe("seated");
    expect(result.current.tableStatuses.statuses.get("t2")).toBe("needs-bussing");
  });

  it("overwrites a table's previous status on a later delta (last write wins)", () => {
    const { result } = renderHook(() => ({ tableStatuses: useTableStatuses(), sync: useSSESync() }), {
      wrapper: makeWrapper(),
    });

    act(() => {
      simulateEvent("table-status:changed", {
        type: "table-status:changed",
        venueId: "v1",
        timestamp: "2026-01-01T00:00:00Z",
        data: [{ tableId: "t1", status: "seated" }],
      });
    });
    act(() => {
      simulateEvent("table-status:changed", {
        type: "table-status:changed",
        venueId: "v1",
        timestamp: "2026-01-01T00:00:01Z",
        data: [{ tableId: "t1", status: "available" }],
      });
    });

    expect(result.current.tableStatuses.statuses.get("t1")).toBe("available");
  });

  it("ignores unrelated event types", () => {
    const { result } = renderHook(() => ({ tableStatuses: useTableStatuses(), sync: useSSESync() }), {
      wrapper: makeWrapper(),
    });

    act(() => {
      simulateEvent("table:updated", {
        type: "table:updated",
        venueId: "v1",
        timestamp: "2026-01-01T00:00:00Z",
        data: { id: "t1" },
      });
    });

    expect(result.current.tableStatuses.statuses.size).toBe(0);
  });
});

describe("useTableStatuses — reconnect resync (#3931)", () => {
  it("replays a status change that happened during the outage once the reconnect resync lands", async () => {
    mockGetStatuses.mockResolvedValueOnce([{ tableId: "t1", status: "available" }]);
    const { result } = renderHook(
      () => ({ tableStatuses: useTableStatuses(), sync: useSSESync() }),
      { wrapper: makeWrapper() }
    );

    await act(async () => {
      await simulateOpen();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.tableStatuses.isStale).toBe(false);
    expect(result.current.tableStatuses.statuses.get("t1")).toBe("available");

    // Connection drops — a status change happens during the outage. There is
    // no delta for it (EventSource has no Last-Event-ID replay), so it would
    // be lost without a resync.
    act(() => {
      simulateError();
    });
    expect(result.current.tableStatuses.isStale).toBe(true);

    mockGetStatuses.mockResolvedValueOnce([{ tableId: "t1", status: "seated" }]);

    act(() => {
      vi.advanceTimersByTime(1000); // scheduled reconnect attempt
    });
    await act(async () => {
      await simulateOpen();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.tableStatuses.isStale).toBe(false);
    expect(result.current.tableStatuses.statuses.get("t1")).toBe("seated");
  });

  it("keeps isStale true after reconnect until the resync snapshot has actually landed", async () => {
    let resolveSnapshot!: (deltas: { tableId: string; status: string }[]) => void;
    const pending = new Promise<{ tableId: string; status: string }[]>((resolve) => {
      resolveSnapshot = resolve;
    });
    mockGetStatuses.mockReturnValueOnce(pending);

    const { result } = renderHook(
      () => ({ tableStatuses: useTableStatuses(), sync: useSSESync() }),
      { wrapper: makeWrapper() }
    );

    act(() => {
      void simulateOpen();
    });

    // Reconnect flipped isConnected, but the resync fetch is still in flight —
    // must NOT clear staleness on reconnect alone (the false-all-clear bug).
    expect(result.current.tableStatuses.isStale).toBe(true);

    await act(async () => {
      resolveSnapshot([]);
      await pending;
      await Promise.resolve();
    });

    expect(result.current.tableStatuses.isStale).toBe(false);
  });
});
