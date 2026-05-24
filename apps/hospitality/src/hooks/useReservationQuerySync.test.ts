import "@testing-library/jest-dom";
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import { useReservationQuerySync } from "./useReservationQuerySync.js";

vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: () => ({ selectedVenueId: "v1" }),
}));

const mockUseReservationEvents = vi.fn().mockReturnValue({
  isConnected: true,
  error: null,
  reconnect: vi.fn(),
});

vi.mock("./useReservationEvents.js", () => ({
  useReservationEvents: (...args: unknown[]) =>
    mockUseReservationEvents(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ToastProvider, null, children)
    );
  };
}

describe("useReservationQuerySync", () => {
  it("calls useReservationEvents with SSE handlers wired to query invalidation", () => {
    renderHook(() => useReservationQuerySync(), { wrapper: createWrapper() });

    expect(mockUseReservationEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        venueId: "v1",
        onReservationCreated: expect.any(Function),
        onReservationUpdated: expect.any(Function),
        onReservationCancelled: expect.any(Function),
        onHoldConfirmed: expect.any(Function),
        onTableUpdated: expect.any(Function),
      })
    );
  });
});
