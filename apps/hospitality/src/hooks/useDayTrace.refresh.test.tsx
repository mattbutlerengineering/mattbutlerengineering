import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const api = vi.hoisted(() => {
  const ok = vi.fn().mockResolvedValue({ version: 9, changeId: "chg-9" });
  return {
    saveConfig: ok,
    revertChange: ok,
    setTonight: ok,
    endTonight: ok,
    createClosure: ok,
    createClosures: ok,
    reopenClosure: ok,
  };
});
vi.mock("./useApiClient.js", () => ({ useApiClient: () => ({ availability: api }) }));

import { useRevertAvailabilityChange, useSaveAvailabilityConfig } from "./useAvailability.js";
import { useCreateClosure, useCreateClosures, useReopenClosure } from "./useClosures.js";
import { useRefreshAvailability } from "./useRefreshAvailability.js";
import { useEndTonight, useSetTonight } from "./useTonight.js";

/**
 * Explain this day lists the times the trace returned for the config as it was read. A save
 * changes the config the rules stack resolves over, so the trace must refresh with it or the two
 * halves of the page disagree for the length of the query's staleTime.
 */
function setup<T>(hook: () => T) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { ...renderHook(hook, { wrapper }), invalidate };
}

const TRACE = { queryKey: ["availabilityDayTrace"] };

const mutations = [
  ["a config save", () => useSaveAvailabilityConfig(), { venueId: "v", body: {} }],
  [
    "an Undo",
    () => useRevertAvailabilityChange(),
    { venueId: "v", changeId: "c", expectedVersion: 1 },
  ],
  ["a closure", () => useCreateClosure(), { venueId: "v", body: {}, idempotencyKey: "k" }],
  ["several closures", () => useCreateClosures(), { venueId: "v", body: {}, idempotencyKey: "k" }],
  ["a reopen", () => useReopenClosure(), { venueId: "v", ruleId: "r", tellCancelledGuests: false }],
  ["a Tonight change", () => useSetTonight(), { venueId: "v", body: {} }],
  ["ending a Tonight change", () => useEndTonight(), { venueId: "v", ruleId: "r" }],
] as const;

describe("the day trace refreshes wherever the availability config does", () => {
  it.each(mutations)("after %s", async (_name, hook, variables) => {
    const { result, invalidate } = setup(hook as () => ReturnType<typeof useEndTonight>);
    await act(async () => {
      result.current.mutate(variables as never);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith(TRACE);
  });

  it("when a refused save brings the screen to the state that won", () => {
    const { result, invalidate } = setup(() => useRefreshAvailability());
    act(() => result.current());
    expect(invalidate).toHaveBeenCalledWith(TRACE);
  });
});
