import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useSeatWaitlistEntry, WAITLIST_QUERY_KEY } from "./useWaitlist.js";
import { RESERVATIONS_QUERY_KEY } from "./useReservations.js";

const mockSeat = vi.fn();

vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({ waitlist: { seat: mockSeat } }),
}));

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

describe("useSeatWaitlistEntry", () => {
  beforeEach(() => {
    mockSeat.mockReset();
    mockSeat.mockResolvedValue({ id: "wl-1", status: "seated" });
  });

  it("invalidates the reservations list as well as the waitlist — seating a party means a walk-in reservation now exists, and the Waitlist's 'View on Timeline' must not land on a 30 s-stale list", async () => {
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useSeatWaitlistEntry(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("wl-1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockSeat).toHaveBeenCalledWith("wl-1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [WAITLIST_QUERY_KEY] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [RESERVATIONS_QUERY_KEY] });
  });
});
