import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { createQueryHook } from "./create-query-hook.js";

/* ── Mocks ───────────────────────────────────────────── */

vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({}),
}));

/* ── Helpers ─────────────────────────────────────────── */

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

/* ── Tests: key derivation ───────────────────────────── */

describe("createQueryHook — key derivation", () => {
  it("uses base key as single-element array when no params", async () => {
    const mockFetch = vi.fn().mockResolvedValue(["item1"]);
    const useItems = createQueryHook({ key: "items", fetcher: mockFetch });

    const { result } = renderHook(() => useItems(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockFetch).toHaveBeenCalledWith(undefined, expect.anything());
    expect(result.current.data).toEqual(["item1"]);
  });

  it("includes params in query key", async () => {
    const mockFetch = vi.fn().mockResolvedValue([]);
    const useItems = createQueryHook<string[], { venueId: string }>({
      key: "items",
      fetcher: mockFetch,
    });

    const { result } = renderHook(() => useItems({ venueId: "v1" }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Params and api passed to fetcher
    expect(mockFetch).toHaveBeenCalledWith({ venueId: "v1" }, expect.anything());
  });
});

/* ── Tests: error mapping ────────────────────────────── */

describe("createQueryHook — error mapping", () => {
  it("returns null error on success", async () => {
    const mockFetch = vi.fn().mockResolvedValue([]);
    const useItems = createQueryHook({ key: "items", fetcher: mockFetch });

    const { result } = renderHook(() => useItems(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeNull();
  });

  it("returns Error instance on failure", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network failure"));
    const useItems = createQueryHook({ key: "items", fetcher: mockFetch });

    const { result } = renderHook(() => useItems(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("Network failure");
  });
});

/* ── Tests: enabled gating ───────────────────────────── */

describe("createQueryHook — enabled gating", () => {
  it("does not fetch when enabled is false", () => {
    const mockFetch = vi.fn().mockResolvedValue([]);
    const useItems = createQueryHook({ key: "items", fetcher: mockFetch });

    const { result } = renderHook(() => useItems({ enabled: false }), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches when enabled is true (default)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(["item"]);
    const useItems = createQueryHook({ key: "items", fetcher: mockFetch });

    const { result } = renderHook(() => useItems({ enabled: true }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFetch).toHaveBeenCalled();
  });

  it("supports custom enabled predicate from params", () => {
    const mockFetch = vi.fn().mockResolvedValue([]);
    const useItems = createQueryHook<string[], { venueId?: string | null }>({
      key: "items",
      fetcher: mockFetch,
      getEnabled: (params) => !!params?.venueId,
    });

    const { result } = renderHook(() => useItems({ venueId: null }), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches when custom enabled predicate returns true", async () => {
    const mockFetch = vi.fn().mockResolvedValue(["item"]);
    const useItems = createQueryHook<string[], { venueId?: string | null }>({
      key: "items",
      fetcher: mockFetch,
      getEnabled: (params) => !!params?.venueId,
    });

    const { result } = renderHook(() => useItems({ venueId: "v1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFetch).toHaveBeenCalledWith({ venueId: "v1" }, expect.anything());
  });
});

/* ── Tests: return shape ─────────────────────────────── */

describe("createQueryHook — return shape", () => {
  it("returns loading state initially", () => {
    const mockFetch = vi.fn().mockReturnValue(new Promise(() => {}));
    const useItems = createQueryHook({ key: "items", fetcher: mockFetch });

    const { result } = renderHook(() => useItems(), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();
  });

  it("exposes a refetch function", async () => {
    const mockFetch = vi.fn().mockResolvedValue([]);
    const useItems = createQueryHook({ key: "items", fetcher: mockFetch });

    const { result } = renderHook(() => useItems(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(typeof result.current.refetch).toBe("function");
  });
});
