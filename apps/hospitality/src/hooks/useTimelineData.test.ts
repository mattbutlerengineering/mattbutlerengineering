import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useTimelineData } from "./useTimelineData.js";
import type { Reservation, Table } from "@mbe/types";

/* ── Mocks ──────────────────────────────────────────── */

const mockReservationsList = vi.fn();
const mockTablesList = vi.fn();
const mockReservationsUpdate = vi.fn();
const mockReservationsCancelWithReason = vi.fn();
const mockReservationsWalkIn = vi.fn();
const mockTablesUpdateStatus = vi.fn();

vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({
    reservations: {
      list: mockReservationsList,
      update: mockReservationsUpdate,
      cancelWithReason: mockReservationsCancelWithReason,
      walkIn: mockReservationsWalkIn,
    },
    tables: {
      list: mockTablesList,
      updateStatus: mockTablesUpdateStatus,
    },
  }),
}));

/* ── Helpers ────────────────────────────────────────── */

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  const todayStr = new Date().toLocaleDateString("en-CA");
  return {
    id: "r1",
    date: todayStr,
    startTime: "2026-05-10T18:00:00",
    endTime: "2026-05-10T20:00:00",
    partySize: 4,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Alice",
    guestEmail: null,
    guestPhone: null,
    guestId: null,
    userId: null,
    occasion: null,
    seatingPreference: null,
    tableId: "t1",
    venueId: "venue-1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeTable(overrides: Partial<Table> = {}): Table {
  return {
    id: "t1",
    name: "Table 1",
    tableNumber: "T1",
    capacity: 4,
    minCovers: 1,
    maxCovers: null,
    location: null,
    isActive: true,
    priority: 1,
    status: "AVAILABLE",
    venueId: "venue-1",
    floorPlanId: null,
    shapeMetadata: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
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

describe("useTimelineData", () => {
  const todayStr = new Date().toLocaleDateString("en-CA");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("query composition", () => {
    it("fetches reservations for the given venueId and date", async () => {
      const reservations = [makeReservation()];
      mockReservationsList.mockResolvedValue({ data: reservations });
      mockTablesList.mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useTimelineData({ venueId: "venue-1", date: todayStr }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(mockReservationsList).toHaveBeenCalledWith(
        expect.objectContaining({ venueId: "venue-1", date: todayStr })
      );
    });

    it("fetches tables for the given venueId", async () => {
      mockReservationsList.mockResolvedValue({ data: [] });
      mockTablesList.mockResolvedValue({ data: [makeTable()] });

      const { result } = renderHook(() => useTimelineData({ venueId: "venue-1", date: todayStr }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(mockTablesList).toHaveBeenCalledWith(expect.objectContaining({ venueId: "venue-1" }));
    });

    it("returns sorted tables by priority desc then name asc", async () => {
      const tables = [
        makeTable({ id: "t3", name: "Charlie", tableNumber: "T3", priority: 1 }),
        makeTable({ id: "t1", name: "Alpha", tableNumber: "T1", priority: 2 }),
        makeTable({ id: "t2", name: "Bravo", tableNumber: "T2", priority: 2 }),
      ];
      mockReservationsList.mockResolvedValue({ data: [] });
      mockTablesList.mockResolvedValue({ data: tables });

      const { result } = renderHook(() => useTimelineData({ venueId: "venue-1", date: todayStr }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      const ids = result.current.tables.map((t) => t.id);
      expect(ids).toEqual(["t1", "t2", "t3"]);
    });

    it("filters reservations to the selected date", async () => {
      const today = todayStr;
      const otherDay = "2026-01-01";
      const reservations = [
        makeReservation({ id: "r1", date: today }),
        makeReservation({ id: "r2", date: otherDay }),
      ];
      mockReservationsList.mockResolvedValue({ data: reservations });
      mockTablesList.mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useTimelineData({ venueId: "venue-1", date: today }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.reservations.every((r) => r.date === today)).toBe(true);
      expect(result.current.reservations.some((r) => r.id === "r2")).toBe(false);
    });

    it("returns combined loading state", async () => {
      mockReservationsList.mockReturnValue(new Promise(() => {}));
      mockTablesList.mockReturnValue(new Promise(() => {}));

      const { result } = renderHook(() => useTimelineData({ venueId: "venue-1", date: todayStr }), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
    });

    it("returns combined fetch error (reservations)", async () => {
      mockReservationsList.mockRejectedValue(new Error("Reservations failed"));
      mockTablesList.mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useTimelineData({ venueId: "venue-1", date: todayStr }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.fetchError?.message).toBe("Reservations failed");
    });

    it("does not fetch when venueId is undefined", () => {
      const { result } = renderHook(() => useTimelineData({ venueId: undefined, date: todayStr }), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(mockReservationsList).not.toHaveBeenCalled();
      expect(mockTablesList).not.toHaveBeenCalled();
    });
  });

  describe("mutation: seatGuest", () => {
    it("calls reservations.update and tables.updateStatus then invalidates", async () => {
      mockReservationsList.mockResolvedValue({ data: [] });
      mockTablesList.mockResolvedValue({ data: [] });
      mockReservationsUpdate.mockResolvedValue({ id: "r1", status: "CONFIRMED" });
      mockTablesUpdateStatus.mockResolvedValue({});

      const { result } = renderHook(() => useTimelineData({ venueId: "venue-1", date: todayStr }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.seatGuest(makeReservation());
      });

      expect(mockReservationsUpdate).toHaveBeenCalledWith("r1", { status: "CONFIRMED" });
      expect(mockTablesUpdateStatus).toHaveBeenCalledWith("t1", "OCCUPIED");
    });

    it("throws when seatGuest fails", async () => {
      mockReservationsList.mockResolvedValue({ data: [] });
      mockTablesList.mockResolvedValue({ data: [] });
      mockReservationsUpdate.mockRejectedValue(new Error("Seat failed"));

      const { result } = renderHook(() => useTimelineData({ venueId: "venue-1", date: todayStr }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await expect(
        act(async () => {
          await result.current.seatGuest(makeReservation());
        })
      ).rejects.toThrow("Seat failed");
    });
  });

  describe("mutation: cancelReservation", () => {
    it("calls reservations.cancelWithReason then invalidates", async () => {
      mockReservationsList.mockResolvedValue({ data: [] });
      mockTablesList.mockResolvedValue({ data: [] });
      mockReservationsCancelWithReason.mockResolvedValue({});

      const { result } = renderHook(() => useTimelineData({ venueId: "venue-1", date: todayStr }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.cancelReservation("r1", { reason: "no_show", note: "test" });
      });

      expect(mockReservationsCancelWithReason).toHaveBeenCalledWith("r1", {
        cancellationReason: "no_show",
        cancellationNote: "test",
      });
    });

    it("throws when cancelReservation fails", async () => {
      mockReservationsList.mockResolvedValue({ data: [] });
      mockTablesList.mockResolvedValue({ data: [] });
      mockReservationsCancelWithReason.mockRejectedValue(new Error("Cancel failed"));

      const { result } = renderHook(() => useTimelineData({ venueId: "venue-1", date: todayStr }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await expect(
        act(async () => {
          await result.current.cancelReservation("r1", { reason: "no_show", note: "" });
        })
      ).rejects.toThrow("Cancel failed");
    });
  });

  describe("mutation: updateReservation", () => {
    it("calls reservations.update and returns updated reservation", async () => {
      mockReservationsList.mockResolvedValue({ data: [] });
      mockTablesList.mockResolvedValue({ data: [] });
      const updated = makeReservation({ partySize: 6 });
      mockReservationsUpdate.mockResolvedValue(updated);

      const { result } = renderHook(() => useTimelineData({ venueId: "venue-1", date: todayStr }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let returnValue: Reservation | undefined;
      await act(async () => {
        returnValue = await result.current.updateReservation("r1", { partySize: 6 });
      });

      expect(mockReservationsUpdate).toHaveBeenCalledWith("r1", { partySize: 6 });
      expect(returnValue?.partySize).toBe(6);
    });
  });

  describe("mutation: createWalkIn", () => {
    it("calls reservations.walkIn then invalidates", async () => {
      mockReservationsList.mockResolvedValue({ data: [] });
      mockTablesList.mockResolvedValue({ data: [] });
      mockReservationsWalkIn.mockResolvedValue({ id: "r-walkin" });

      const { result } = renderHook(() => useTimelineData({ venueId: "venue-1", date: todayStr }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const walkInData = { partySize: 2, tableId: "t1", venueId: "venue-1", guestName: "Walkin" };
      await act(async () => {
        await result.current.createWalkIn(walkInData);
      });

      expect(mockReservationsWalkIn).toHaveBeenCalledWith(walkInData);
    });
  });

  describe("mutation: updateTableStatus", () => {
    it("calls tables.updateStatus then invalidates", async () => {
      mockReservationsList.mockResolvedValue({ data: [] });
      mockTablesList.mockResolvedValue({ data: [] });
      mockTablesUpdateStatus.mockResolvedValue({});

      const { result } = renderHook(() => useTimelineData({ venueId: "venue-1", date: todayStr }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.updateTableStatus("t1", "OCCUPIED");
      });

      expect(mockTablesUpdateStatus).toHaveBeenCalledWith("t1", "OCCUPIED");
    });
  });

  describe("stats computation", () => {
    it("computes correct stats from reservations", async () => {
      const reservations = [
        makeReservation({ id: "r1", status: "CONFIRMED", partySize: 4, date: todayStr }),
        makeReservation({ id: "r2", status: "PENDING", partySize: 2, date: todayStr }),
        makeReservation({ id: "r3", status: "CANCELLED", partySize: 3, date: todayStr }),
      ];
      mockReservationsList.mockResolvedValue({ data: reservations });
      mockTablesList.mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useTimelineData({ venueId: "venue-1", date: todayStr }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.stats.confirmed).toBe(1);
      expect(result.current.stats.pending).toBe(1);
      expect(result.current.stats.total).toBe(3);
      expect(result.current.stats.totalCovers).toBe(6); // 4 + 2 (CANCELLED excluded)
    });
  });
});
