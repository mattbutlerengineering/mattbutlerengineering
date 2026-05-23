 
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useTables } from "./useTables.js";
import type { Table, PaginatedResponse } from "@mbe/types";

/* ── Mocks ──────────────────────────────────────────── */

const mockList = vi.fn();

vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({
    tables: { list: mockList },
  }),
}));

/* ── Helpers ────────────────────────────────────────── */

function makeTable(overrides: Partial<Table> = {}): Table {
  return {
    id: "table-1",
    name: "Table 1",
    tableNumber: "1",
    capacity: 4,
    minCovers: 1,
    maxCovers: 4,
    location: null,
    isActive: true,
    priority: 1,
    status: "AVAILABLE",
    venueId: "venue-1",
    floorPlanId: null,
    shapeMetadata: null,
    createdAt: "2026-01-15T00:00:00Z",
    updatedAt: "2026-01-15T00:00:00Z",
    ...overrides,
  };
}

function makePaginatedResponse(tables: Table[]): PaginatedResponse<Table> {
  return {
    data: tables,
    pagination: {
      page: 1,
      limit: 50,
      total: tables.length,
      totalPages: 1,
      hasNext: false,
    },
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

/* ── Tests ──────────────────────────────────────────── */

describe("useTables", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns loading state initially", () => {
    mockList.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useTables({ venueId: "v1" }), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();
  });

  it("returns table data on success", async () => {
    const tables = [makeTable({ id: "t1" }), makeTable({ id: "t2" })];
    mockList.mockResolvedValue(makePaginatedResponse(tables));

    const { result } = renderHook(() => useTables({ venueId: "v1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(tables);
    expect(result.current.error).toBeNull();
  });

  it("returns error state on failure", async () => {
    mockList.mockRejectedValue(new Error("Server error"));

    const { result } = renderHook(() => useTables({ venueId: "v1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("Server error");
    expect(result.current.data).toBeUndefined();
  });

  it("passes params to api client", async () => {
    mockList.mockResolvedValue(makePaginatedResponse([]));

    renderHook(() => useTables({ venueId: "v1", activeOnly: true }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith({
        venueId: "v1",
        activeOnly: true,
      });
    });
  });

  it("exposes a refetch function", async () => {
    mockList.mockResolvedValue(makePaginatedResponse([]));

    const { result } = renderHook(() => useTables({ venueId: "v1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(typeof result.current.refetch).toBe("function");
  });

  it("does not fetch when enabled is false", async () => {
    const { result } = renderHook(
      () => useTables({ venueId: "v1", enabled: false }),
      {
        wrapper: createWrapper(),
      }
    );

    expect(result.current.isLoading).toBe(false);
    expect(mockList).not.toHaveBeenCalled();
  });
});
