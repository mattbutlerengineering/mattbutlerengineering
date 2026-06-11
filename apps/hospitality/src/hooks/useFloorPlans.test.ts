import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useFloorPlans, useFloorPlan } from "./useFloorPlans.js";
import type { FloorPlan } from "@mbe/types";

/* ── Mocks ──────────────────────────────────────────── */

const mockList = vi.fn();
const mockGetById = vi.fn();

vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({
    floorPlans: {
      list: mockList,
      getById: mockGetById,
    },
  }),
}));

/* ── Helpers ────────────────────────────────────────── */

function makeFloorPlan(overrides: Partial<FloorPlan> = {}): FloorPlan {
  return {
    id: "fp-1",
    name: "Main Floor",
    venueId: "venue-1",
    isActive: true,
    tables: [],
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

/* ── Tests: useFloorPlans ───────────────────────────── */

describe("useFloorPlans", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns loading state initially", () => {
    mockList.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useFloorPlans({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();
  });

  it("returns floor plans on success", async () => {
    const plans = [makeFloorPlan({ id: "fp-1" }), makeFloorPlan({ id: "fp-2" })];
    mockList.mockResolvedValue({ data: plans, pagination: {} });

    const { result } = renderHook(() => useFloorPlans({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(plans);
    expect(result.current.error).toBeNull();
  });

  it("returns error on failure", async () => {
    mockList.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useFloorPlans({ venueId: "venue-1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.data).toBeUndefined();
  });

  it("does not fetch when enabled is false", () => {
    const { result } = renderHook(() => useFloorPlans({ enabled: false }), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(false);
    expect(mockList).not.toHaveBeenCalled();
  });
});

/* ── Tests: useFloorPlan ────────────────────────────── */

describe("useFloorPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns loading state initially", () => {
    mockGetById.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useFloorPlan("fp-1"), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(true);
  });

  it("returns floor plan on success", async () => {
    const plan = makeFloorPlan();
    mockGetById.mockResolvedValue(plan);

    const { result } = renderHook(() => useFloorPlan("fp-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(plan);
    expect(result.current.error).toBeNull();
  });

  it("does not fetch when id is undefined", () => {
    const { result } = renderHook(() => useFloorPlan(undefined), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(false);
    expect(mockGetById).not.toHaveBeenCalled();
  });

  it("returns null data when id is undefined", () => {
    const { result } = renderHook(() => useFloorPlan(undefined), {
      wrapper: createWrapper(),
    });
    expect(result.current.data).toBeNull();
  });
});
