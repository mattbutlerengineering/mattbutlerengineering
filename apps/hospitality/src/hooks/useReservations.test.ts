import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useReservations } from "./useReservations.js";
import type { UseReservationsParams, UseReservationsResult } from "./useReservations.js";
import type { Reservation, PaginatedResponse } from "@mbe/types";

/* ── Mocks ──────────────────────────────────────────── */

const mockList = vi.fn();
const mockGetCachedReservations = vi.fn();
const mockSetCachedReservations = vi.fn();

vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({
    reservations: { list: mockList },
  }),
}));

vi.mock("../lib/offline-cache.js", () => ({
  getCachedReservations: (venueId: string, date: string) =>
    mockGetCachedReservations(venueId, date),
  setCachedReservations: (venueId: string, date: string, reservations: unknown) =>
    mockSetCachedReservations(venueId, date, reservations),
}));

function cachedEntry(reservations: Reservation[], cachedAt = 1_700_000_000_000) {
  return { reservations, cachedAt };
}

/* ── Helpers ────────────────────────────────────────── */

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res-1",
    date: "2026-01-15",
    startTime: "2026-01-15T18:00:00Z",
    endTime: "2026-01-15T20:00:00Z",
    partySize: 4,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Test Guest",
    guestEmail: null,
    guestPhone: null,
    guestId: null,
    userId: null,
    tableId: "table-1",
    venueId: "venue-1",
    createdAt: "2026-01-15T00:00:00Z",
    updatedAt: "2026-01-15T00:00:00Z",
    ...overrides,
  };
}

function makePaginatedResponse(reservations: Reservation[]): PaginatedResponse<Reservation> {
  return {
    data: reservations,
    pagination: {
      page: 1,
      limit: 50,
      total: reservations.length,
      totalPages: 1,
      hasNext: false,
    },
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

/* ── Tests ──────────────────────────────────────────── */

describe("useReservations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedReservations.mockResolvedValue(null);
    mockSetCachedReservations.mockResolvedValue(undefined);
  });

  it("returns loading state initially", () => {
    mockList.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useReservations({ date: "2026-01-15", venueId: "v1" }), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();
  });

  it("returns reservation data on success", async () => {
    const reservations = [makeReservation({ id: "r1" }), makeReservation({ id: "r2" })];
    mockList.mockResolvedValue(makePaginatedResponse(reservations));

    const { result } = renderHook(() => useReservations({ date: "2026-01-15", venueId: "v1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(reservations);
    expect(result.current.error).toBeNull();
  });

  it("caches reservations in offline storage on successful fetch", async () => {
    const reservations = [makeReservation({ id: "r1" }), makeReservation({ id: "r2" })];
    mockList.mockResolvedValue(makePaginatedResponse(reservations));

    renderHook(() => useReservations({ date: "2026-01-15", venueId: "v1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockSetCachedReservations).toHaveBeenCalledWith("v1", "2026-01-15", reservations);
    });
  });

  it("returns error state on failure", async () => {
    mockList.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useReservations({ date: "2026-01-15", venueId: "v1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("Network error");
    expect(result.current.data).toBeUndefined();
    expect(result.current.isFromCache).toBe(false);
  });

  it("falls back to cached data on fetch failure when a cache entry exists", async () => {
    const cachedReservations = [makeReservation({ id: "cached-1" })];
    mockList.mockRejectedValue(new Error("Network error"));
    mockGetCachedReservations.mockResolvedValue(cachedEntry(cachedReservations, 1_700_000_000_000));

    const { result } = renderHook(() => useReservations({ date: "2026-01-15", venueId: "v1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isFromCache).toBe(true);
    });

    expect(mockGetCachedReservations).toHaveBeenCalledWith("v1", "2026-01-15");
    expect(result.current.data).toEqual(cachedReservations);
    expect(result.current.error).toBeNull();
    expect(result.current.lastSyncedAt).toBe(1_700_000_000_000);
  });

  it("exposes lastSyncedAt for a fresh (non-cached) fetch", async () => {
    const reservations = [makeReservation({ id: "r1" })];
    mockList.mockResolvedValue(makePaginatedResponse(reservations));

    const { result } = renderHook(() => useReservations({ date: "2026-01-15", venueId: "v1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.lastSyncedAt).toBeDefined();
    });

    expect(result.current.isFromCache).toBe(false);
    expect(typeof result.current.lastSyncedAt).toBe("number");
  });

  it("lastSyncedAt is undefined before any successful fetch or cache read", () => {
    mockList.mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useReservations({ date: "2026-01-15", venueId: "v1" }), {
      wrapper: createWrapper(),
    });

    expect(result.current.lastSyncedAt).toBeUndefined();
  });

  it("passes params to api client", async () => {
    mockList.mockResolvedValue(makePaginatedResponse([]));

    renderHook(
      () =>
        useReservations({
          date: "2026-01-15",
          venueId: "v1",
          limit: 25,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith({
        date: "2026-01-15",
        venueId: "v1",
        limit: 25,
      });
    });
  });

  it("exposes a refetch function", async () => {
    mockList.mockResolvedValue(makePaginatedResponse([]));

    const { result } = renderHook(() => useReservations({ date: "2026-01-15", venueId: "v1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(typeof result.current.refetch).toBe("function");
  });

  it("does not leak a different venue's cached reservations when switching venues while offline", async () => {
    // Reproduces a stale-cache leak: switching venueId B -> A -> B while
    // every fetch fails must never render venue B under venue A's cached
    // (guest-PII-bearing) reservations, even transiently.
    const cachedReservationsA = [makeReservation({ id: "cached-a-1", guestName: "Alice VenueA" })];
    mockList.mockRejectedValue(new Error("Network error"));
    mockGetCachedReservations.mockImplementation((venueId: string) =>
      Promise.resolve(venueId === "venue-a" ? cachedEntry(cachedReservationsA) : null)
    );

    const history: Array<{ venueId: string | undefined; result: UseReservationsResult }> = [];
    function useTrackedReservations(
      params: UseReservationsParams | undefined
    ): UseReservationsResult {
      const result = useReservations(params);
      history.push({ venueId: params?.venueId, result });
      return result;
    }

    const { result, rerender } = renderHook(
      (props: UseReservationsParams | undefined) => useTrackedReservations(props),
      {
        initialProps: { date: "2026-01-15", venueId: "venue-b" },
        wrapper: createWrapper(),
      }
    );

    // Step 1: venue B fails, no cache for B -> real error surfaces.
    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    expect(result.current.isFromCache).toBe(false);

    // Step 2: switch to venue A, which fails but has a cache hit.
    rerender({ date: "2026-01-15", venueId: "venue-a" });
    await waitFor(() => {
      expect(result.current.isFromCache).toBe(true);
    });
    expect(result.current.data).toEqual(cachedReservationsA);

    // Step 3: switch back to venue B (still offline). React-query re-fetches
    // B from scratch (isLoading briefly true again) before failing a second
    // time — the bug window is the render where B's fetch has just failed
    // again but the stale `cachedFallback` from venue A hasn't been
    // reset/re-fetched yet, which committedly renders A's guest data under
    // venue B for one paint before the hook self-corrects.
    rerender({ date: "2026-01-15", venueId: "venue-b" });

    // Let every transition settle: B's second fetch attempt failing, the
    // cache-read effect racing it, and the eventual self-correction to "no
    // cache for B" once `getCachedReservations("venue-b", ...)` resolves.
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    await waitFor(() => {
      expect(result.current.isFromCache).toBe(false);
    });

    // Assert on the full committed render history recorded above, not just
    // the final settled state — the bug self-corrects one render later, so
    // checking only the end state would pass against the broken code too.
    const leaked = history.some(
      (entry) =>
        entry.venueId === "venue-b" &&
        entry.result.data?.some((reservation) => reservation.id === "cached-a-1")
    );
    expect(leaked).toBe(false);
  });

  it("does not fetch when enabled is false", async () => {
    const { result } = renderHook(
      () =>
        useReservations({
          date: "2026-01-15",
          venueId: "v1",
          enabled: false,
        }),
      { wrapper: createWrapper() }
    );

    // Should remain in a non-loading state without fetching
    expect(result.current.isLoading).toBe(false);
    expect(mockList).not.toHaveBeenCalled();
  });
});
