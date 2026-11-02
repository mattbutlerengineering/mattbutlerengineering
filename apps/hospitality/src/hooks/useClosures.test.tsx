import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useCreateClosure } from "./useClosures.js";

const createClosure = vi.fn();

vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({ availability: { createClosure } }),
}));

describe("useCreateClosure", () => {
  it("refreshes the Special dates counts, which a close from Edit this date changes (#7975)", async () => {
    createClosure.mockResolvedValue({ ruleId: "r", version: 2, changeId: "c" });
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useCreateClosure(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        venueId: "venue-1",
        idempotencyKey: "key-1",
        body: {} as never,
      });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["closureSummaries"] });
  });
});
