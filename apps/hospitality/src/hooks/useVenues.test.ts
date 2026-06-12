import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useVenues, useVenueBySlug } from "./useVenues.js";
import type { Venue } from "@mbe/types";

/* ── Mocks ──────────────────────────────────────────── */

const mockList = vi.fn();
const mockGetBySlug = vi.fn();

vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({
    venues: {
      list: mockList,
      getBySlug: mockGetBySlug,
    },
  }),
}));

/* ── Helpers ────────────────────────────────────────── */

function makeVenue(overrides: Partial<Venue> = {}): Venue {
  return {
    id: "venue-1",
    name: "The Rooftop",
    slug: "the-rooftop",
    ianaTimezone: "America/New_York",
    operatingHours: {},
    settings: null,
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

/* ── Tests: useVenues ───────────────────────────────── */

describe("useVenues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns loading state initially", () => {
    mockList.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useVenues(), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(true);
  });

  it("returns venues on success", async () => {
    const venues = [makeVenue({ id: "v1" }), makeVenue({ id: "v2" })];
    mockList.mockResolvedValue({ data: venues, pagination: {} });

    const { result } = renderHook(() => useVenues(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(venues);
    expect(result.current.error).toBeNull();
  });

  it("returns error on failure", async () => {
    mockList.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useVenues(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("does not fetch when enabled is false", () => {
    const { result } = renderHook(() => useVenues({ enabled: false }), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(false);
    expect(mockList).not.toHaveBeenCalled();
  });
});

/* ── Tests: useVenueBySlug ──────────────────────────── */

describe("useVenueBySlug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns loading state initially", () => {
    mockGetBySlug.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useVenueBySlug("the-rooftop"), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(true);
  });

  it("returns venue on success", async () => {
    const venue = makeVenue();
    mockGetBySlug.mockResolvedValue(venue);

    const { result } = renderHook(() => useVenueBySlug("the-rooftop"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(venue);
  });

  it("does not fetch when slug is undefined", () => {
    const { result } = renderHook(() => useVenueBySlug(undefined), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(false);
    expect(mockGetBySlug).not.toHaveBeenCalled();
  });

  it("returns null data when slug is undefined", () => {
    const { result } = renderHook(() => useVenueBySlug(undefined), {
      wrapper: createWrapper(),
    });
    expect(result.current.data).toBeNull();
  });
});
