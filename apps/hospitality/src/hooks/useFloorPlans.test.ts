import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useFloorPlans,
  useFloorPlan,
  useActivateFloorPlan,
  useBulkUpdatePositions,
  useAddTable,
} from "./useFloorPlans.js";
import type { FloorPlan } from "@mbe/types";

/* ── Mocks ──────────────────────────────────────────── */

const mockList = vi.fn();
const mockGetById = vi.fn();
const mockSetActive = vi.fn();
const mockBulkUpdatePositions = vi.fn();
const mockCreateTable = vi.fn();

vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({
    floorPlans: {
      list: mockList,
      getById: mockGetById,
      setActive: mockSetActive,
      bulkUpdatePositions: mockBulkUpdatePositions,
    },
    tables: {
      create: mockCreateTable,
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
    layoutJson: { width: 800, height: 600 },
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

/* ── Tests: mutations invalidate the detail query's real cache key ── */

describe("floor-plan mutations invalidate the cached useFloorPlan entry", () => {
  // The exact key useFloorPlan("fp-1") caches under (createQueryHook: [key, params]).
  const detailKey = ["floorPlan", { id: "fp-1" }];

  function seededClient() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(detailKey, makeFloorPlan({ id: "fp-1", isActive: false }));
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    return { queryClient, wrapper };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("useActivateFloorPlan invalidates the detail entry", async () => {
    mockSetActive.mockResolvedValue(undefined);
    const { queryClient, wrapper } = seededClient();
    const { result } = renderHook(() => useActivateFloorPlan(), { wrapper });

    await result.current.mutateAsync("fp-1");

    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true);
  });

  it("useBulkUpdatePositions invalidates the detail entry", async () => {
    mockBulkUpdatePositions.mockResolvedValue(undefined);
    const { queryClient, wrapper } = seededClient();
    const { result } = renderHook(() => useBulkUpdatePositions(), { wrapper });

    await result.current.mutateAsync({ floorPlanId: "fp-1", positions: [] });

    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true);
  });

  it("useAddTable invalidates the detail entry", async () => {
    mockCreateTable.mockResolvedValue({ id: "t-1" });
    const { queryClient, wrapper } = seededClient();
    const { result } = renderHook(() => useAddTable(), { wrapper });

    await result.current.mutateAsync({ name: "T1", capacity: 2, floorPlanId: "fp-1" });

    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true);
  });
});
