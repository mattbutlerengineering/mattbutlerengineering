import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useGuests, useGuestSegments, useGuestSearch } from "./useGuests.js";
import type { Guest, GuestSegment } from "@mbe/types";

/* ── Mocks ──────────────────────────────────────────── */

const mockList = vi.fn();
const mockSearch = vi.fn();
const mockGetSegments = vi.fn();

vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({
    guests: {
      list: mockList,
      search: mockSearch,
      getSegments: mockGetSegments,
    },
  }),
}));

/* ── Helpers ────────────────────────────────────────── */

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "guest-1",
    name: "John Doe",
    email: "john@example.com",
    phone: null,
    notes: null,
    tags: [],
    visitCount: 3,
    lastVisit: "2026-01-01T00:00:00Z",
    lifetimeSpend: null,
    venueId: "venue-1",
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

/* ── Tests: useGuests ───────────────────────────────── */

describe("useGuests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns loading state initially", () => {
    mockList.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useGuests({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(true);
  });

  it("returns guests on success", async () => {
    const guests = [makeGuest({ id: "g1" }), makeGuest({ id: "g2" })];
    mockList.mockResolvedValue({ data: guests, pagination: {} });

    const { result } = renderHook(() => useGuests({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(guests);
    expect(result.current.error).toBeNull();
  });

  it("returns error on failure", async () => {
    mockList.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useGuests({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("does not fetch when venueId is null", () => {
    const { result } = renderHook(() => useGuests({ venueId: null }), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(false);
    expect(mockList).not.toHaveBeenCalled();
  });
});

/* ── Tests: useGuestSegments ────────────────────────── */

describe("useGuestSegments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns segments on success", async () => {
    const segments: GuestSegment[] = [
      { name: "VIP", count: 5 },
      { name: "Regular", count: 20 },
    ];
    mockGetSegments.mockResolvedValue(segments);

    const { result } = renderHook(() => useGuestSegments("venue-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(segments);
  });

  it("does not fetch when venueId is null", () => {
    const { result } = renderHook(() => useGuestSegments(null), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(false);
    expect(mockGetSegments).not.toHaveBeenCalled();
  });
});

/* ── Tests: useGuestSearch ──────────────────────────── */

describe("useGuestSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not search when query is empty", () => {
    const { result } = renderHook(
      () => useGuestSearch({ venueId: "venue-1", query: "" }),
      { wrapper: createWrapper() }
    );
    expect(result.current.isLoading).toBe(false);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("searches when query is provided", async () => {
    const guests = [makeGuest({ name: "John" })];
    mockSearch.mockResolvedValue({ data: guests, pagination: {} });

    const { result } = renderHook(
      () => useGuestSearch({ venueId: "venue-1", query: "John" }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(guests);
  });
});
