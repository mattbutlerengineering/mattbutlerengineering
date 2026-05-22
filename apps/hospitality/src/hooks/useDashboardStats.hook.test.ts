/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useDashboardStats } from "./useDashboardStats.js";
import { useAuth } from "@mbe/auth/react";
import { useVenue } from "../contexts/VenueContext.js";
import { createApiClient } from "@mbe/api-client";

vi.mock("@mbe/auth/react", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: vi.fn(),
}));

vi.mock("@mbe/api-client", () => ({
  createApiClient: vi.fn(),
}));

describe("useDashboardStats hook", () => {
  const mockList = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAuth).mockReturnValue({
      accessToken: "test-token",
    } as any);

    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: "venue-1",
      venues: [],
      selectVenue: vi.fn(),
    } as any);

    vi.mocked(createApiClient).mockReturnValue({
      reservations: { list: mockList },
    } as any);
  });

  it("starts in loading state", () => {
    mockList.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useDashboardStats());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("fetches reservations on mount", async () => {
    mockList.mockResolvedValue({
      data: [
        { id: "r1", status: "CONFIRMED", partySize: 4, startTime: "18:00", date: "2026-05-10" },
      ],
    });

    const { result } = renderHook(() => useDashboardStats());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.reservations).toHaveLength(1);
    expect(result.current.stats.totalReservations).toBe(1);
    expect(result.current.stats.expectedCovers).toBe(4);
  });

  it("sets error state on fetch failure", async () => {
    mockList.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useDashboardStats());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("Network error");
    expect(result.current.reservations).toHaveLength(0);
  });

  it("sets generic error message for non-Error exceptions", async () => {
    mockList.mockRejectedValue("unexpected");

    const { result } = renderHook(() => useDashboardStats());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("Failed to load reservations");
  });

  it("passes venueId filter when a venue is selected", async () => {
    mockList.mockResolvedValue({ data: [] });

    renderHook(() => useDashboardStats());

    await waitFor(() => {
      expect(mockList).toHaveBeenCalled();
    });

    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ venueId: "venue-1" }));
  });

  it("does not pass venueId filter when no venue is selected", async () => {
    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: null,
      venues: [],
      selectVenue: vi.fn(),
    } as any);

    mockList.mockResolvedValue({ data: [] });

    renderHook(() => useDashboardStats());

    await waitFor(() => {
      expect(mockList).toHaveBeenCalled();
    });

    const callArgs = mockList.mock.calls[0][0];
    expect(callArgs.venueId).toBeUndefined();
  });

  it("refetch re-fetches the data", async () => {
    mockList.mockResolvedValue({ data: [] });

    const { result } = renderHook(() => useDashboardStats());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockList.mockResolvedValue({
      data: [
        { id: "r1", status: "CONFIRMED", partySize: 2, startTime: "19:00", date: "2026-05-10" },
      ],
    });

    await result.current.refetch();

    await waitFor(() => {
      expect(result.current.reservations).toHaveLength(1);
    });
  });
});
