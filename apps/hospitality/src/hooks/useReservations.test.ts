import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useReservations } from "./useReservations.js";
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
    mockGetCachedReservations.mockResolvedValue(cachedReservations);

    const { result } = renderHook(() => useReservations({ date: "2026-01-15", venueId: "v1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isFromCache).toBe(true);
    });

    expect(mockGetCachedReservations).toHaveBeenCalledWith("v1", "2026-01-15");
    expect(result.current.data).toEqual(cachedReservations);
    expect(result.current.error).toBeNull();
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
