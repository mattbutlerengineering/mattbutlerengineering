import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useRefreshWaitlist, WAITLIST_QUERY_KEY } from "./useWaitlist.js";
import { RESERVATIONS_QUERY_KEY } from "./useReservations.js";

describe("useRefreshWaitlist", () => {
  it("invalidates the reservations list as well as the waitlist — seating a party means a walk-in reservation now exists, and the Waitlist's 'View on Timeline' must not land on a 30 s-stale list", () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useRefreshWaitlist(), { wrapper });
    result.current();

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [WAITLIST_QUERY_KEY] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [RESERVATIONS_QUERY_KEY] });
  });
});
