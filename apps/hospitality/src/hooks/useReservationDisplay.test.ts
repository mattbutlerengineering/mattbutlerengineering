import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useReservationDisplay } from "./useReservationDisplay.js";
import type { Reservation } from "@mbe/types";

/* ── Mocks ──────────────────────────────────────────── */

const mockUseReservations = vi.fn();

vi.mock("./useReservations.js", () => ({
  useReservations: (...args: unknown[]) => mockUseReservations(...args),
  RESERVATIONS_QUERY_KEY: "reservations",
}));

/* ── Helpers ────────────────────────────────────────── */

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "r1",
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
    occasion: null,
    seatingPreference: null,
    tableId: "table-1",
    venueId: "venue-1",
    createdAt: "2026-01-15T00:00:00Z",
    updatedAt: "2026-01-15T00:00:00Z",
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

/* ── Tests ──────────────────────────────────────────── */

describe("useReservationDisplay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseReservations.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  describe("return shape", () => {
    it("exposes data, stats, filteredData, isLoading, and error", () => {
      const { result } = renderHook(
        () =>
          useReservationDisplay({
            date: "2026-01-15",
            venueId: "v1",
            statusFilter: "all",
            searchQuery: "",
          }),
        { wrapper: createWrapper() }
      );

      expect(result.current).toHaveProperty("data");
      expect(result.current).toHaveProperty("stats");
      expect(result.current).toHaveProperty("filteredData");
      expect(result.current).toHaveProperty("isLoading");
      expect(result.current).toHaveProperty("error");
    });

    it("forwards isLoading from underlying hook", () => {
      mockUseReservations.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderHook(
        () =>
          useReservationDisplay({
            date: "2026-01-15",
            venueId: "v1",
            statusFilter: "all",
            searchQuery: "",
          }),
        { wrapper: createWrapper() }
      );

      expect(result.current.isLoading).toBe(true);
    });

    it("forwards error from underlying hook", () => {
      const error = new Error("API failure");
      mockUseReservations.mockReturnValue({
        data: undefined,
        isLoading: false,
        error,
        refetch: vi.fn(),
      });

      const { result } = renderHook(
        () =>
          useReservationDisplay({
            date: "2026-01-15",
            venueId: "v1",
            statusFilter: "all",
            searchQuery: "",
          }),
        { wrapper: createWrapper() }
      );

      expect(result.current.error).toBe(error);
    });
  });

  describe("stats computation", () => {
    it("returns zero stats when data is undefined", () => {
      mockUseReservations.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderHook(
        () =>
          useReservationDisplay({
            date: "2026-01-15",
            venueId: "v1",
            statusFilter: "all",
            searchQuery: "",
          }),
        { wrapper: createWrapper() }
      );

      expect(result.current.stats.total).toBe(0);
      expect(result.current.stats.confirmed).toBe(0);
      expect(result.current.stats.pending).toBe(0);
      expect(result.current.stats.cancelled).toBe(0);
    });

    it("counts all reservation statuses correctly", () => {
      const reservations = [
        makeReservation({ id: "r1", status: "CONFIRMED" }),
        makeReservation({ id: "r2", status: "CONFIRMED" }),
        makeReservation({ id: "r3", status: "PENDING" }),
        makeReservation({ id: "r4", status: "CANCELLED" }),
        makeReservation({ id: "r5", status: "CANCELLED" }),
        makeReservation({ id: "r6", status: "CANCELLED" }),
      ];
      mockUseReservations.mockReturnValue({
        data: reservations,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderHook(
        () =>
          useReservationDisplay({
            date: "2026-01-15",
            venueId: "v1",
            statusFilter: "all",
            searchQuery: "",
          }),
        { wrapper: createWrapper() }
      );

      expect(result.current.stats.total).toBe(6);
      expect(result.current.stats.confirmed).toBe(2);
      expect(result.current.stats.pending).toBe(1);
      expect(result.current.stats.cancelled).toBe(3);
    });

    it("stats reflect full dataset regardless of statusFilter", () => {
      const reservations = [
        makeReservation({ id: "r1", status: "CONFIRMED" }),
        makeReservation({ id: "r2", status: "PENDING" }),
      ];
      mockUseReservations.mockReturnValue({
        data: reservations,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderHook(
        () =>
          useReservationDisplay({
            date: "2026-01-15",
            venueId: "v1",
            statusFilter: "CONFIRMED",
            searchQuery: "",
          }),
        { wrapper: createWrapper() }
      );

      // Stats are always from the full data, not filtered
      expect(result.current.stats.total).toBe(2);
      expect(result.current.stats.confirmed).toBe(1);
      expect(result.current.stats.pending).toBe(1);
    });
  });

  describe("filtering by status", () => {
    const reservations = [
      makeReservation({ id: "r1", guestName: "Alice", status: "CONFIRMED" }),
      makeReservation({ id: "r2", guestName: "Bob", status: "PENDING" }),
      makeReservation({ id: "r3", guestName: "Carol", status: "CANCELLED" }),
    ];

    beforeEach(() => {
      mockUseReservations.mockReturnValue({
        data: reservations,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
    });

    it("returns all reservations when statusFilter is all", () => {
      const { result } = renderHook(
        () =>
          useReservationDisplay({
            date: "2026-01-15",
            venueId: "v1",
            statusFilter: "all",
            searchQuery: "",
          }),
        { wrapper: createWrapper() }
      );

      expect(result.current.filteredData).toHaveLength(3);
    });

    it("filters to CONFIRMED only when statusFilter is CONFIRMED", () => {
      const { result } = renderHook(
        () =>
          useReservationDisplay({
            date: "2026-01-15",
            venueId: "v1",
            statusFilter: "CONFIRMED",
            searchQuery: "",
          }),
        { wrapper: createWrapper() }
      );

      expect(result.current.filteredData).toHaveLength(1);
      expect(result.current.filteredData[0].guestName).toBe("Alice");
    });

    it("filters to PENDING only when statusFilter is PENDING", () => {
      const { result } = renderHook(
        () =>
          useReservationDisplay({
            date: "2026-01-15",
            venueId: "v1",
            statusFilter: "PENDING",
            searchQuery: "",
          }),
        { wrapper: createWrapper() }
      );

      expect(result.current.filteredData).toHaveLength(1);
      expect(result.current.filteredData[0].guestName).toBe("Bob");
    });

    it("filters to CANCELLED only when statusFilter is CANCELLED", () => {
      const { result } = renderHook(
        () =>
          useReservationDisplay({
            date: "2026-01-15",
            venueId: "v1",
            statusFilter: "CANCELLED",
            searchQuery: "",
          }),
        { wrapper: createWrapper() }
      );

      expect(result.current.filteredData).toHaveLength(1);
      expect(result.current.filteredData[0].guestName).toBe("Carol");
    });
  });

  describe("filtering by search query", () => {
    const reservations = [
      makeReservation({
        id: "r1",
        guestName: "Alice Smith",
        guestEmail: null,
        status: "CONFIRMED",
      }),
      makeReservation({
        id: "r2",
        guestName: "Bob Jones",
        guestEmail: "bob@example.com",
        status: "PENDING",
      }),
    ];

    beforeEach(() => {
      mockUseReservations.mockReturnValue({
        data: reservations,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
    });

    it("returns all when searchQuery is empty", () => {
      const { result } = renderHook(
        () =>
          useReservationDisplay({
            date: "2026-01-15",
            venueId: "v1",
            statusFilter: "all",
            searchQuery: "",
          }),
        { wrapper: createWrapper() }
      );

      expect(result.current.filteredData).toHaveLength(2);
    });

    it("filters by guest name case-insensitively", () => {
      const { result } = renderHook(
        () =>
          useReservationDisplay({
            date: "2026-01-15",
            venueId: "v1",
            statusFilter: "all",
            searchQuery: "alice",
          }),
        { wrapper: createWrapper() }
      );

      expect(result.current.filteredData).toHaveLength(1);
      expect(result.current.filteredData[0].guestName).toBe("Alice Smith");
    });

    it("filters by guest email case-insensitively", () => {
      const { result } = renderHook(
        () =>
          useReservationDisplay({
            date: "2026-01-15",
            venueId: "v1",
            statusFilter: "all",
            searchQuery: "bob@example",
          }),
        { wrapper: createWrapper() }
      );

      expect(result.current.filteredData).toHaveLength(1);
      expect(result.current.filteredData[0].guestName).toBe("Bob Jones");
    });

    it("returns empty array when no matches", () => {
      const { result } = renderHook(
        () =>
          useReservationDisplay({
            date: "2026-01-15",
            venueId: "v1",
            statusFilter: "all",
            searchQuery: "zzznotfound",
          }),
        { wrapper: createWrapper() }
      );

      expect(result.current.filteredData).toHaveLength(0);
    });

    it("applies both status and search filters together", () => {
      const { result } = renderHook(
        () =>
          useReservationDisplay({
            date: "2026-01-15",
            venueId: "v1",
            statusFilter: "CONFIRMED",
            searchQuery: "bob",
          }),
        { wrapper: createWrapper() }
      );

      // Bob is PENDING, so combined filter returns nothing
      expect(result.current.filteredData).toHaveLength(0);
    });
  });
});
