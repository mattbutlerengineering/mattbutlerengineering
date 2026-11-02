import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const revertChange = vi.hoisted(() => vi.fn());
vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({ availability: { revertChange } }),
}));

import { useRevertAvailabilityChange } from "./useAvailability.js";

describe("useRevertAvailabilityChange", () => {
  it("refreshes the closure counts, which an Undo of a series growth moves between rules (#7984)", async () => {
    revertChange.mockResolvedValue({ version: 9, changeId: "chg-9" });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useRevertAvailabilityChange(), { wrapper });

    await act(async () => {
      result.current.mutate({ venueId: "venue-1", changeId: "chg-8", expectedVersion: 8 });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["closureSummaries"] });
  });
});
