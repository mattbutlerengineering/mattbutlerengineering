import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const api = vi.hoisted(() => ({
  listHolidayDecisions: vi.fn(),
  setHolidayDecision: vi.fn(),
  clearHolidayDecision: vi.fn(),
}));
vi.mock("./useApiClient.js", () => ({ useApiClient: () => ({ availability: api }) }));

import {
  useClearHolidayDecision,
  useHolidayDecisions,
  useSetHolidayDecision,
} from "./useHolidayDecisions.js";

const setup = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { invalidate, wrapper };
};

describe("holiday decision hooks", () => {
  it("reads the decisions for the range, and not at all without a venue", async () => {
    const row = { serviceDate: "2026-12-24", decision: "open_as_usual", createdAt: "t" };
    api.listHolidayDecisions.mockResolvedValue([row]);
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useHolidayDecisions({ venueId: "v1", from: "2026-11-08", to: "2027-11-08" }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.data).toEqual([row]));
    expect(api.listHolidayDecisions).toHaveBeenCalledWith("v1", {
      from: "2026-11-08",
      to: "2027-11-08",
    });

    api.listHolidayDecisions.mockClear();
    const none = renderHook(
      () => useHolidayDecisions({ venueId: null, from: "2026-11-08", to: "2027-11-08" }),
      { wrapper }
    );
    expect(none.result.current.data).toBeUndefined();
    expect(api.listHolidayDecisions).not.toHaveBeenCalled();
  });

  it("set and clear refresh the decisions and nothing in the availability config", async () => {
    api.setHolidayDecision.mockResolvedValue({
      serviceDate: "2026-12-24",
      decision: "open_as_usual",
      createdAt: "t",
    });
    api.clearHolidayDecision.mockResolvedValue(undefined);
    const { invalidate, wrapper } = setup();
    const set = renderHook(() => useSetHolidayDecision(), { wrapper });
    const clear = renderHook(() => useClearHolidayDecision(), { wrapper });

    await act(async () => {
      await set.result.current.mutateAsync({
        venueId: "v1",
        serviceDate: "2026-12-24",
        decision: "open_as_usual",
      });
      await clear.result.current.mutateAsync({ venueId: "v1", serviceDate: "2026-12-24" });
    });

    expect(api.setHolidayDecision).toHaveBeenCalledWith("v1", "2026-12-24", "open_as_usual");
    expect(api.clearHolidayDecision).toHaveBeenCalledWith("v1", "2026-12-24");
    expect(invalidate.mock.calls.map(([filter]) => filter)).toEqual([
      { queryKey: ["holidayDecisions"] },
      { queryKey: ["holidayDecisions"] },
    ]);
  });
});
