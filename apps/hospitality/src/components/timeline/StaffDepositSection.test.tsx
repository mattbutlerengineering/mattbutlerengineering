import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { createApiClient } from "@mbe/api-client";
import { StaffDepositSection } from "./StaffDepositSection.js";
import { RESERVATIONS_QUERY_KEY } from "../../hooks/useReservations.js";
import type { Deposit } from "@mbe/types";

/* ── Mock transport ─────────────────────────────────── */

// The component creates deposits through the real typed `api.deposits` resource;
// only the HTTP transport is stubbed, so the create runs end-to-end against the
// api-client mock transport rather than a hand-built resource stub.
const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

vi.mock("../../hooks/useApiClient.js", () => ({
  useApiClient: () => createApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

vi.mock("@mattbutlerengineering/rialto", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    variant,
    size,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
    size?: string;
  }) => (
    <button
      data-testid={`btn-${variant ?? "default"}-${size ?? "default"}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  ),
  Alert: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <div data-testid="alert" data-variant={variant}>
      {children}
    </div>
  ),
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Input: ({
    label,
    value,
    onChange,
    placeholder,
    disabled,
    type,
  }: {
    label?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    disabled?: boolean;
    type?: string;
  }) => (
    <div>
      <label>{label}</label>
      <input
        data-testid="amount-input"
        type={type ?? "text"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  ),
}));

const mockDeposit: Deposit = {
  id: "dep-1",
  reservationId: "res-1",
  amountCents: 2500,
  currency: "usd",
  status: "held",
  stripePaymentIntentId: "pi_test",
  stripeCustomerId: null,
  heldAt: "2026-05-26T00:00:00Z",
  appliedAt: null,
  refundedAt: null,
  forfeitedAt: null,
  createdAt: "2026-05-26T00:00:00Z",
  updatedAt: "2026-05-26T00:00:00Z",
};

interface RenderOptions {
  existingDeposit?: Deposit | null;
}

function renderSection({ existingDeposit }: RenderOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <StaffDepositSection reservationId="res-1" existingDeposit={existingDeposit} />
    </QueryClientProvider>
  );
  return { ...utils, invalidateSpy };
}

describe("StaffDepositSection", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("shows collect deposit button when no existing deposit", () => {
    renderSection();
    expect(screen.getByText("+ Collect Deposit")).toBeDefined();
  });

  it("shows existing deposit amount and status", () => {
    renderSection({ existingDeposit: mockDeposit });
    expect(screen.getAllByText(/\$25\.00/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Authorized/)).toBeDefined();
  });

  it("shows deposit form when collect button clicked", () => {
    renderSection();
    fireEvent.click(screen.getByText("+ Collect Deposit"));
    expect(screen.getByTestId("amount-input")).toBeDefined();
  });

  it("shows error for invalid amount without touching the transport", () => {
    renderSection();
    fireEvent.click(screen.getByText("+ Collect Deposit"));
    // Enter zero amount (passes the !amountInput check but fails validation).
    const input = screen.getByTestId("amount-input");
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.click(screen.getByText("Create Deposit"));
    expect(screen.getByTestId("alert")).toBeDefined();
    expect(screen.getByText(/valid amount/i)).toBeDefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("creates a deposit via api.deposits and invalidates the timeline query", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { ...mockDeposit, status: "pending", heldAt: null } })
    );

    const { invalidateSpy } = renderSection();
    fireEvent.click(screen.getByText("+ Collect Deposit"));

    const input = screen.getByTestId("amount-input");
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.click(screen.getByText("Create Deposit"));

    // Form closes once the create resolves — the created deposit surfaces to
    // siblings through cache invalidation, not component-local state.
    await waitFor(() => {
      expect(screen.queryByTestId("amount-input")).toBeNull();
    });

    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.test.com/api/v1/deposits");
    expect(options?.method).toBe("POST");
    expect(JSON.parse(options?.body as string)).toEqual({
      reservationId: "res-1",
      amountCents: 2500,
      currency: "usd",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [RESERVATIONS_QUERY_KEY] });
  });

  it("shows error when the deposit create fails", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "Bad Request", message: "Card declined", statusCode: 400 }, 400)
    );

    const { invalidateSpy } = renderSection();
    fireEvent.click(screen.getByText("+ Collect Deposit"));

    const input = screen.getByTestId("amount-input");
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.click(screen.getByText("Create Deposit"));

    await waitFor(() => {
      expect(screen.getByTestId("alert")).toBeDefined();
      expect(screen.getByText(/Card declined/)).toBeDefined();
    });
    // A failed create must not invalidate the timeline cache.
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("hides form when cancel clicked", () => {
    renderSection();
    fireEvent.click(screen.getByText("+ Collect Deposit"));
    expect(screen.getByTestId("amount-input")).toBeDefined();
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByTestId("amount-input")).toBeNull();
  });
});
