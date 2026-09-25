import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useDepositByReservation, useCreateDeposit } from "./useDeposits.js";
import type { Deposit } from "@mbe/types";

/* ── Mocks ──────────────────────────────────────────── */

const mockGetByReservation = vi.fn();
const mockCreate = vi.fn();

vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({
    deposits: {
      getByReservation: mockGetByReservation,
      create: mockCreate,
    },
  }),
}));

/* ── Helpers ────────────────────────────────────────── */

function makeDeposit(overrides: Partial<Deposit> = {}): Deposit {
  return {
    id: "dep-1",
    reservationId: "res-1",
    amountCents: 2500,
    currency: "usd",
    status: "held",
    stripePaymentIntentId: "pi_1",
    stripeCustomerId: null,
    heldAt: "2026-05-26T00:00:00Z",
    appliedAt: null,
    refundedAt: null,
    forfeitedAt: null,
    createdAt: "2026-05-26T00:00:00Z",
    updatedAt: "2026-05-26T00:00:00Z",
    ...overrides,
  };
}

function createWrapper(
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

/* ── Tests: useDepositByReservation ───────────────────── */

describe("useDepositByReservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns loading state initially", () => {
    mockGetByReservation.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useDepositByReservation("res-1"), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(true);
  });

  it("returns the deposit on success", async () => {
    const deposit = makeDeposit();
    mockGetByReservation.mockResolvedValue(deposit);

    const { result } = renderHook(() => useDepositByReservation("res-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(deposit);
    expect(mockGetByReservation).toHaveBeenCalledWith("res-1");
  });

  it("returns null (not undefined) when the reservation has no deposit yet", async () => {
    mockGetByReservation.mockResolvedValue(null);

    const { result } = renderHook(() => useDepositByReservation("res-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeNull();
  });

  it("does not fetch when reservationId is null", () => {
    renderHook(() => useDepositByReservation(null), { wrapper: createWrapper() });
    expect(mockGetByReservation).not.toHaveBeenCalled();
  });
});

/* ── Tests: useCreateDeposit ───────────────────────────── */

describe("useCreateDeposit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invalidates both reservations and deposits queries on success, so a freshly created deposit shows immediately", async () => {
    mockCreate.mockResolvedValue(makeDeposit());
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateDeposit(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({ reservationId: "res-1", amountCents: 2500 });

    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey?.[0]);
    expect(invalidatedKeys).toContain("reservations");
    expect(invalidatedKeys).toContain("deposits");
  });
});
