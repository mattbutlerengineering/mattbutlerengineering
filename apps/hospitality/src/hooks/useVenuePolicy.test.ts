import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useVenuePolicy } from "./useVenuePolicy.js";

/* ── Mocks ──────────────────────────────────────────── */

const getDepositPolicy = vi.fn();
const rawGet = vi.fn();

// Module-factory mock keeps the stub structurally typed without loose casts.
vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({
    publicVenue: { getDepositPolicy },
    client: { get: rawGet },
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useVenuePolicy", () => {
  it("fetches via publicVenue.getDepositPolicy and maps the deposit to a CancellationPolicy", async () => {
    getDepositPolicy.mockResolvedValue({
      enabled: true,
      depositType: "flat",
      amountCents: 5000,
      freeCancellationHours: 24,
      lateCancellationFeePercent: 50,
      noShowFeePercent: 100,
    });

    const { result } = renderHook(() => useVenuePolicy("the-oak-table"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.policy).not.toBeNull();
    });

    expect(getDepositPolicy).toHaveBeenCalledWith("the-oak-table");
    // Zero raw transport in the migrated site.
    expect(rawGet).not.toHaveBeenCalled();
    expect(result.current.policy).toEqual({
      depositAmountCents: 5000,
      freeCancellationHours: 24,
      lateCancellationFeePercent: 50,
      noShowFeePercent: 100,
    });
  });

  it("returns null when the deposit is disabled", async () => {
    getDepositPolicy.mockResolvedValue({
      enabled: false,
      depositType: null,
      amountCents: null,
      freeCancellationHours: null,
      lateCancellationFeePercent: null,
      noShowFeePercent: null,
    });

    const { result } = renderHook(() => useVenuePolicy("the-oak-table"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(getDepositPolicy).toHaveBeenCalledWith("the-oak-table");
    expect(result.current.policy).toBeNull();
  });

  it("does not fetch when slug is undefined", () => {
    const { result } = renderHook(() => useVenuePolicy(undefined), {
      wrapper: createWrapper(),
    });

    expect(getDepositPolicy).not.toHaveBeenCalled();
    expect(rawGet).not.toHaveBeenCalled();
    expect(result.current.policy).toBeNull();
  });

  it("swallows fetch errors to a null policy (non-critical staff-dialog lookup)", async () => {
    getDepositPolicy.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useVenuePolicy("the-oak-table"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(getDepositPolicy).toHaveBeenCalled();
    });

    expect(result.current.policy).toBeNull();
  });
});
