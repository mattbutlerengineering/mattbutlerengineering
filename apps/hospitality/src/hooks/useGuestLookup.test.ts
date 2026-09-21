import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Guest } from "@mbe/types";
import type { UseGuestSearchParams, UseGuestsResult } from "./useGuests.js";
import { useGuestLookup } from "./useGuestLookup.js";

const mockUseGuestSearch = vi.fn<(params: UseGuestSearchParams) => UseGuestsResult>();

vi.mock("./useGuests.js", () => ({
  useGuestSearch: (params: UseGuestSearchParams) => mockUseGuestSearch(params),
}));

function makeGuest(i: number): Guest {
  return {
    id: `gst_${i}`,
    venueId: "venue-1",
    name: `Guest ${i}`,
    email: `guest${i}@example.com`,
    phone: null,
    notes: null,
    visitCount: i,
    noShowCount: 0,
    riskScore: "trusted",
    lifetimeSpend: "0.00",
    lastVisit: null,
    tags: null,
    dietaryRestrictions: null,
    staffNotes: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
}

const idle: UseGuestsResult = { data: undefined, isLoading: false, error: null, refetch: vi.fn() };

/** The params of every `useGuestSearch` call made with `enabled: true`. */
function enabledCalls() {
  return mockUseGuestSearch.mock.calls.map(([params]) => params).filter((p) => p.enabled);
}

describe("useGuestLookup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUseGuestSearch.mockReset();
    mockUseGuestSearch.mockReturnValue(idle);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays disabled with empty rows under the 2-character minimum", () => {
    const { result } = renderHook(() => useGuestLookup({ venueId: "venue-1", text: "a" }));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(mockUseGuestSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ venueId: "venue-1", enabled: false })
    );
    expect(result.current.rows).toEqual([]);
    expect(result.current.query).toBe("");
    expect(enabledCalls()).toEqual([]);
  });

  it("enables the search for 2+ characters only after the 300 ms pause", () => {
    const { result } = renderHook(() => useGuestLookup({ venueId: "venue-1", text: "al" }));
    expect(enabledCalls()).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(enabledCalls()).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(mockUseGuestSearch).toHaveBeenLastCalledWith({
      venueId: "venue-1",
      query: "al",
      enabled: true,
    });
    expect(result.current.query).toBe("al");
  });

  it("collapses three keystrokes inside 300 ms into one query for the last text", () => {
    const { rerender } = renderHook(
      ({ text }: { text: string }) => useGuestLookup({ venueId: "venue-1", text }),
      { initialProps: { text: "a" } }
    );
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ text: "al" });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ text: "ali" });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(enabledCalls()).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    const queries = new Set(enabledCalls().map((p) => p.query));
    expect([...queries]).toEqual(["ali"]);
  });

  it("disables the search again the moment the text drops under the minimum", () => {
    const { result, rerender } = renderHook(
      ({ text }: { text: string }) => useGuestLookup({ venueId: "venue-1", text }),
      { initialProps: { text: "al" } }
    );
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.query).toBe("al");
    rerender({ text: "a" });
    expect(result.current.query).toBe("");
    expect(mockUseGuestSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false })
    );
  });

  it("caps rows at six and reports hasMore for a seventh match", () => {
    const seven = Array.from({ length: 7 }, (_, i) => makeGuest(i + 1));
    mockUseGuestSearch.mockImplementation((params) =>
      params.enabled ? { ...idle, data: seven } : idle
    );
    const { result } = renderHook(() => useGuestLookup({ venueId: "venue-1", text: "al" }));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.rows).toHaveLength(6);
    expect(result.current.rows.map((g) => g.id)).toEqual(seven.slice(0, 6).map((g) => g.id));
    expect(result.current.hasMore).toBe(true);
  });

  it("reports hasMore false and passes isLoading through for six or fewer", () => {
    mockUseGuestSearch.mockImplementation((params) =>
      params.enabled ? { ...idle, data: undefined, isLoading: true } : idle
    );
    const { result } = renderHook(() => useGuestLookup({ venueId: "venue-1", text: "al" }));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.rows).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });

  it("reports failed when the search errors", () => {
    mockUseGuestSearch.mockImplementation((params) =>
      params.enabled ? { ...idle, error: new Error("boom") } : idle
    );
    const { result } = renderHook(() => useGuestLookup({ venueId: "venue-1", text: "al" }));
    expect(result.current.failed).toBe(false);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.failed).toBe(true);
  });
});
