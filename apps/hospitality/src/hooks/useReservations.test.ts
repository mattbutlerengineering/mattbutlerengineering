 
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useReservations } from "./useReservations.js";
import type { Reservation, PaginatedResponse } from "@mbe/types";

/* ── Mocks ──────────────────────────────────────────── */

const mockList = vi.fn();

vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({
    reservations: { list: mockList },
  }),
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

function makePaginatedResponse(
  reservations: Reservation[]
): PaginatedResponse<Reservation> {
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
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

/* ── Tests ──────────────────────────────────────────── */

describe("useReservations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns loading state initially", () => {
    mockList.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(
      () => useReservations({ date: "2026-01-15", venueId: "v1" }),
      {
        wrapper: createWrapper(),
      }
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();
  });

  it("returns reservation data on success", async () => {
    const reservations = [
      makeReservation({ id: "r1" }),
      makeReservation({ id: "r2" }),
    ];
    mockList.mockResolvedValue(makePaginatedResponse(reservations));

    const { result } = renderHook(
      () => useReservations({ date: "2026-01-15", venueId: "v1" }),
      {
        wrapper: createWrapper(),
      }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(reservations);
    expect(result.current.error).toBeNull();
  });

  it("returns error state on failure", async () => {
    mockList.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(
      () => useReservations({ date: "2026-01-15", venueId: "v1" }),
      {
        wrapper: createWrapper(),
      }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("Network error");
    expect(result.current.data).toBeUndefined();
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

    const { result } = renderHook(
      () => useReservations({ date: "2026-01-15", venueId: "v1" }),
      {
        wrapper: createWrapper(),
      }
    );

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
