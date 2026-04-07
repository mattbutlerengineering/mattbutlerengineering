import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { VenueProvider, useVenue } from "./VenueContext.js";
import type { Venue } from "@mbe/types";

/* ── Mocks ──────────────────────────────────────────────────── */

const mockVenues: readonly Venue[] = [
  {
    id: "venue-1",
    venueGroupId: null,
    name: "Downtown Bistro",
    slug: "downtown-bistro",
    ianaTimezone: "America/New_York",
    currencyCode: "USD",
    operatingHours: null,
    settings: null,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "venue-2",
    venueGroupId: null,
    name: "Uptown Grill",
    slug: "uptown-grill",
    ianaTimezone: "America/Chicago",
    currencyCode: "USD",
    operatingHours: null,
    settings: null,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
];

const mockList = vi.fn();

vi.mock("@mbe/api-client", () => ({
  createApiClient: () => ({
    venues: { list: mockList },
  }),
}));

vi.mock("@mbe/auth/react", () => ({
  useAuth: () => ({ accessToken: "test-token" }),
}));

// localStorage mock
const storageMap = new Map<string, string>();

beforeEach(() => {
  storageMap.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => storageMap.set(key, value),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
    length: 0,
    key: () => null,
  });

  mockList.mockReset();
  mockList.mockResolvedValue({ data: mockVenues });
});

function wrapper({ children }: { readonly children: ReactNode }) {
  return <VenueProvider>{children}</VenueProvider>;
}

describe("VenueContext", () => {
  it("fetches venues on mount and selects the first venue", async () => {
    const { result } = renderHook(() => useVenue(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockList).toHaveBeenCalledOnce();
    expect(result.current.venues).toHaveLength(2);
    expect(result.current.selectedVenueId).toBe("venue-1");
    expect(result.current.selectedVenue?.name).toBe("Downtown Bistro");
    expect(result.current.isMultiVenue).toBe(true);
  });

  it("persists selected venue in localStorage", async () => {
    const { result } = renderHook(() => useVenue(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.setVenueId("venue-2");
    });

    expect(result.current.selectedVenueId).toBe("venue-2");
    expect(storageMap.get("mbe-hospitality-venue-id")).toBe("venue-2");
  });

  it("restores venue selection from localStorage", async () => {
    storageMap.set("mbe-hospitality-venue-id", "venue-2");

    const { result } = renderHook(() => useVenue(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.selectedVenueId).toBe("venue-2");
    expect(result.current.selectedVenue?.name).toBe("Uptown Grill");
  });

  it("handles fetch error by clearing venues", async () => {
    mockList.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useVenue(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.venues).toHaveLength(0);
    expect(result.current.selectedVenueId).toBeNull();
    expect(result.current.selectedVenue).toBeNull();
  });

  it("throws when useVenue is called outside VenueProvider", () => {
    // Suppress React error boundary console noise
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useVenue());
    }).toThrow("useVenue must be used within a VenueProvider");

    consoleSpy.mockRestore();
  });
});
