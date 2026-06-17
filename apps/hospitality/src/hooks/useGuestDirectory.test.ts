import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useGuestDirectory } from "./useGuestDirectory.js";
import type { Guest, GuestSegment } from "@mbe/types";

/* ── Mocks ──────────────────────────────────────────── */

const mockList = vi.fn();
const mockSearch = vi.fn();
const mockGetSegments = vi.fn();
const mockFindOrCreate = vi.fn();
const mockUpdate = vi.fn();

vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({
    guests: {
      list: mockList,
      search: mockSearch,
      getSegments: mockGetSegments,
      findOrCreate: mockFindOrCreate,
      update: mockUpdate,
    },
  }),
}));

/* ── Helpers ────────────────────────────────────────── */

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "g1",
    name: "John Doe",
    email: "john@example.com",
    phone: null,
    visitCount: 1,
    notes: null,
    tags: [],
    dietaryRestrictions: [],
    lastVisit: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    venueId: "venue-1",
    ...overrides,
  };
}

function makeSegment(overrides: Partial<GuestSegment> = {}): GuestSegment {
  return { name: "VIP", count: 5, ...overrides };
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

describe("useGuestDirectory — search toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({ data: [makeGuest()], pagination: {} });
    mockSearch.mockResolvedValue({ data: [], pagination: {} });
    mockGetSegments.mockResolvedValue([makeSegment()]);
  });

  it("uses list query when search query is empty", async () => {
    const { result } = renderHook(() => useGuestDirectory({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockList).toHaveBeenCalled();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("switches to search query when search text is set", async () => {
    const { result } = renderHook(() => useGuestDirectory({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setSearchQuery("John");
    });

    // After debounce settles
    await waitFor(
      () => {
        expect(mockSearch).toHaveBeenCalledWith(
          expect.objectContaining({ query: "John", venueId: "venue-1" })
        );
      },
      { timeout: 1500 }
    );
  });

  it("returns search query value from state", async () => {
    const { result } = renderHook(() => useGuestDirectory({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });

    expect(result.current.searchQuery).toBe("");

    act(() => {
      result.current.setSearchQuery("Jane");
    });

    expect(result.current.searchQuery).toBe("Jane");
  });

  it("clears search query when set to empty string", async () => {
    const { result } = renderHook(() => useGuestDirectory({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.setSearchQuery("Jane");
    });
    expect(result.current.searchQuery).toBe("Jane");

    act(() => {
      result.current.setSearchQuery("");
    });
    expect(result.current.searchQuery).toBe("");
  });
});

describe("useGuestDirectory — debounce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockList.mockResolvedValue({ data: [], pagination: {} });
    mockSearch.mockResolvedValue({ data: [], pagination: {} });
    mockGetSegments.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not fire search immediately on each keystroke", async () => {
    const { result } = renderHook(() => useGuestDirectory({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.setSearchQuery("J");
    });
    act(() => {
      result.current.setSearchQuery("Jo");
    });
    act(() => {
      result.current.setSearchQuery("Joh");
    });

    // Search not fired yet
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("fires search once after debounce delay", async () => {
    const { result } = renderHook(() => useGuestDirectory({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.setSearchQuery("J");
    });
    act(() => {
      result.current.setSearchQuery("John");
    });

    // Advance past debounce window and flush microtasks
    await act(async () => {
      vi.runAllTimers();
    });

    expect(mockSearch).toHaveBeenCalledWith(expect.objectContaining({ query: "John" }));
  });
});

describe("useGuestDirectory — selection state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({ data: [makeGuest()], pagination: {} });
    mockGetSegments.mockResolvedValue([]);
  });

  it("starts with no selected guest", () => {
    const { result } = renderHook(() => useGuestDirectory({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });

    expect(result.current.selectedGuestId).toBeNull();
    expect(result.current.selectedGuest).toBeNull();
  });

  it("sets selected guest when selectGuest is called", async () => {
    const { result } = renderHook(() => useGuestDirectory({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.selectGuest("g1");
    });

    expect(result.current.selectedGuestId).toBe("g1");
    expect(result.current.selectedGuest?.id).toBe("g1");
  });

  it("clears selected guest when clearSelection is called", async () => {
    const { result } = renderHook(() => useGuestDirectory({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.selectGuest("g1");
    });
    expect(result.current.selectedGuestId).toBe("g1");

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectedGuestId).toBeNull();
    expect(result.current.selectedGuest).toBeNull();
  });
});

describe("useGuestDirectory — mutation flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({ data: [makeGuest()], pagination: {} });
    mockGetSegments.mockResolvedValue([makeSegment()]);
    mockFindOrCreate.mockResolvedValue(makeGuest({ id: "g-new" }));
    mockUpdate.mockResolvedValue(makeGuest({ name: "Updated Name" }));
  });

  it("exposes addGuest mutation", () => {
    const { result } = renderHook(() => useGuestDirectory({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.addGuest).toBe("function");
  });

  it("exposes updateGuest mutation", () => {
    const { result } = renderHook(() => useGuestDirectory({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.updateGuest).toBe("function");
  });

  it("calls findOrCreate API when addGuest is invoked", async () => {
    const { result } = renderHook(() => useGuestDirectory({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.addGuest({
        venueId: "venue-1",
        name: "New Guest",
        email: "new@example.com",
      });
    });

    expect(mockFindOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New Guest", venueId: "venue-1" })
    );
  });

  it("calls update API when updateGuest is invoked", async () => {
    const { result } = renderHook(() => useGuestDirectory({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.updateGuest("g1", { name: "Updated Name" });
    });

    expect(mockUpdate).toHaveBeenCalledWith("g1", { name: "Updated Name" });
  });

  it("invalidates guest list after addGuest succeeds", async () => {
    const { result } = renderHook(() => useGuestDirectory({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const callCountBefore = mockList.mock.calls.length;

    await act(async () => {
      await result.current.addGuest({ venueId: "venue-1", name: "New Guest" });
    });

    await waitFor(() => {
      expect(mockList.mock.calls.length).toBeGreaterThan(callCountBefore);
    });
  });

  it("exposes addGuestPending flag", () => {
    const { result } = renderHook(() => useGuestDirectory({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.isAddingGuest).toBe("boolean");
  });
});

describe("useGuestDirectory — segments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({ data: [], pagination: {} });
    mockGetSegments.mockResolvedValue([
      makeSegment({ name: "VIP", count: 5 }),
      makeSegment({ name: "Regular", count: 10 }),
    ]);
  });

  it("exposes segments data", async () => {
    const { result } = renderHook(() => useGuestDirectory({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.segments).toBeDefined();
    });

    expect(result.current.segments?.length).toBe(2);
    expect(result.current.segments?.[0].name).toBe("VIP");
  });
});

describe("useGuestDirectory — errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSegments.mockResolvedValue([]);
  });

  it("exposes error when list query fails", async () => {
    mockList.mockRejectedValue(new Error("Network timeout"));

    const { result } = renderHook(() => useGuestDirectory({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error);
    });

    expect(result.current.error?.message).toBe("Network timeout");
  });

  it("exposes refetch function", () => {
    mockList.mockResolvedValue({ data: [], pagination: {} });

    const { result } = renderHook(() => useGuestDirectory({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.refetch).toBe("function");
  });
});
