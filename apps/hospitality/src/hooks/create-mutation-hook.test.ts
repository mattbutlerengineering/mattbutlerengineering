import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { createMutationHook } from "./create-mutation-hook.js";

/* ── Mocks ───────────────────────────────────────────── */

const mockApiMethod = vi.fn();

vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({ entity: { update: mockApiMethod } }),
}));

/* ── Helpers ─────────────────────────────────────────── */

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    wrapper: function Wrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client: queryClient }, children);
    },
    queryClient,
  };
}

/* ── Tests: mutation invocation ──────────────────────── */

describe("createMutationHook — mutation invocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the mutationFn with variables on mutate", async () => {
    mockApiMethod.mockResolvedValue({ id: "1", name: "Updated" });

    const useUpdateEntity = createMutationHook({
      invalidateKey: "entities",
      mutationFn: (_api, variables: { id: string; name: string }) => mockApiMethod(variables),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateEntity(), { wrapper });

    await act(async () => {
      result.current.mutate({ id: "1", name: "Updated" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiMethod).toHaveBeenCalledWith({ id: "1", name: "Updated" });
  });

  it("returns isPending true while mutation is in flight", async () => {
    let resolve: (val: unknown) => void = () => {};
    mockApiMethod.mockReturnValue(new Promise((r) => (resolve = r)));

    const useUpdateEntity = createMutationHook({
      invalidateKey: "entities",
      mutationFn: (_api, variables: { id: string }) => mockApiMethod(variables),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateEntity(), { wrapper });

    act(() => {
      result.current.mutate({ id: "1" });
    });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    resolve({ id: "1" });
  });
});

/* ── Tests: query invalidation ───────────────────────── */

describe("createMutationHook — query invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invalidates the specified query key on success", async () => {
    mockApiMethod.mockResolvedValue({ id: "1" });

    const useUpdateEntity = createMutationHook({
      invalidateKey: "entities",
      mutationFn: (_api, variables: { id: string }) => mockApiMethod(variables),
    });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateEntity(), { wrapper });

    await act(async () => {
      result.current.mutate({ id: "1" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["entities"] });
  });

  it("does NOT invalidate when mutation fails", async () => {
    mockApiMethod.mockRejectedValue(new Error("Server error"));

    const useUpdateEntity = createMutationHook({
      invalidateKey: "entities",
      mutationFn: (_api, variables: { id: string }) => mockApiMethod(variables),
    });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateEntity(), { wrapper });

    await act(async () => {
      result.current.mutate({ id: "1" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

/* ── Tests: error propagation ────────────────────────── */

describe("createMutationHook — error propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes error on failure", async () => {
    mockApiMethod.mockRejectedValue(new Error("Network failure"));

    const useUpdateEntity = createMutationHook({
      invalidateKey: "entities",
      mutationFn: (_api, variables: { id: string }) => mockApiMethod(variables),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateEntity(), { wrapper });

    await act(async () => {
      result.current.mutate({ id: "1" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("Network failure");
  });

  it("error is null on success", async () => {
    mockApiMethod.mockResolvedValue({ id: "1" });

    const useUpdateEntity = createMutationHook({
      invalidateKey: "entities",
      mutationFn: (_api, variables: { id: string }) => mockApiMethod(variables),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateEntity(), { wrapper });

    await act(async () => {
      result.current.mutate({ id: "1" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.error).toBeNull();
  });
});

/* ── Tests: return shape ─────────────────────────────── */

describe("createMutationHook — return shape", () => {
  it("returns mutate, isPending, isSuccess, isError, error", () => {
    const useUpdateEntity = createMutationHook({
      invalidateKey: "entities",
      mutationFn: (_api, variables: { id: string }) => mockApiMethod(variables),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateEntity(), { wrapper });

    expect(typeof result.current.mutate).toBe("function");
    expect(typeof result.current.mutateAsync).toBe("function");
    expect(typeof result.current.isPending).toBe("boolean");
    expect(typeof result.current.isSuccess).toBe("boolean");
    expect(typeof result.current.isError).toBe("boolean");
    expect(result.current.error).toBeNull();
  });
});
