import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { PaymentStep } from "./PaymentStep.js";
import type { BookingWidgetApiClient } from "./PaymentStep.js";
import type { DepositConfig } from "@mbe/types";

// Mock Stripe
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="stripe-elements">{children}</div>
  ),
  CardElement: () => <div data-testid="card-element" />,
  useStripe: vi.fn(),
  useElements: vi.fn(),
}));

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn().mockResolvedValue({}),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    variant,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
  }) => (
    <button
      data-testid={variant === "ghost" ? "back-button" : "pay-button"}
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
}));

const mockDepositConfig: DepositConfig = {
  enabled: true,
  amountCents: 2500,
  currency: "usd",
  depositType: "flat",
  freeCancellationHours: 24,
  lateCancellationFeePercent: 50,
  noShowFeePercent: 100,
};

const mockApi = {
  publicVenue: {
    depositIntent: vi.fn(),
  },
};

describe("PaymentStep", () => {
  const defaultProps = {
    api: mockApi as unknown as BookingWidgetApiClient,
    depositConfig: mockDepositConfig,
    partySize: 2,
    reservationId: "res-123",
    onSuccess: vi.fn(),
    onBack: vi.fn(),
    venueSlug: "test-venue",
    stripePublishableKey: "pk_test_key",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders deposit amount for flat fee", () => {
    render(<PaymentStep {...defaultProps} />);
    expect(screen.getAllByText(/\$25\.00/).length).toBeGreaterThan(0);
  });

  it("renders deposit amount for per-person fee", () => {
    const perPersonConfig: DepositConfig = {
      ...mockDepositConfig,
      depositType: "per_person",
      amountCents: 1000,
    };
    render(<PaymentStep {...defaultProps} depositConfig={perPersonConfig} partySize={3} />);
    // 3 guests * $10 = $30
    expect(screen.getAllByText(/\$30\.00/).length).toBeGreaterThan(0);
  });

  it("renders cancellation policy summary", () => {
    render(<PaymentStep {...defaultProps} />);
    expect(screen.getByText(/free cancellation/i)).toBeDefined();
    expect(screen.getByText(/24/)).toBeDefined();
  });

  it("renders the consent screen's late-fee dollar amount from the charged TOTAL for per_person venues, and discloses the no-show term", () => {
    const perPersonConfig: DepositConfig = {
      ...mockDepositConfig,
      depositType: "per_person",
      amountCents: 1000, // $10/guest
      lateCancellationFeePercent: 50,
      noShowFeePercent: 100,
    };
    render(<PaymentStep {...defaultProps} depositConfig={perPersonConfig} partySize={4} />);
    // Total deposit = $10 x 4 guests = $40; 50% late fee = $20.00 (NOT $5.00, the per-person base)
    expect(screen.getByText(/free cancellation/i).textContent).toContain("$20.00");
    // No-show disclosure must be visible before the guest authorizes the hold
    expect(screen.getByText(/no-show/i)).toBeDefined();
  });

  it("renders Stripe card element", () => {
    render(<PaymentStep {...defaultProps} />);
    expect(screen.getByTestId("stripe-elements")).toBeDefined();
    expect(screen.getByTestId("card-element")).toBeDefined();
  });

  it("calls onBack when back button clicked", () => {
    render(<PaymentStep {...defaultProps} />);
    fireEvent.click(screen.getByTestId("back-button"));
    expect(defaultProps.onBack).toHaveBeenCalledTimes(1);
  });

  it("shows loading state while processing", async () => {
    const stripeModule = await import("@stripe/react-stripe-js");
    const { useStripe, useElements } = vi.mocked(stripeModule);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useStripe as any).mockReturnValue({
      confirmCardPayment: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useElements as any).mockReturnValue({
      getElement: vi.fn().mockReturnValue({}),
    });
    mockApi.publicVenue.depositIntent.mockResolvedValue({
      clientSecret: "pi_secret_test",
      depositId: "dep-1",
      amountCents: 2500,
      currency: "usd",
    });

    render(<PaymentStep {...defaultProps} />);
    const payButton = screen.getByTestId("pay-button");
    fireEvent.click(payButton);
    expect(payButton).toBeDisabled();
  });

  it("shows error when payment fails", async () => {
    const { useStripe, useElements } = await import("@stripe/react-stripe-js");
    vi.mocked(useStripe).mockReturnValue({
      confirmCardPayment: vi.fn().mockResolvedValue({ error: { message: "Card declined" } }),
    } as unknown as ReturnType<typeof useStripe>);
    vi.mocked(useElements).mockReturnValue({
      getElement: vi.fn().mockReturnValue({}),
    } as unknown as ReturnType<typeof useElements>);

    mockApi.publicVenue.depositIntent.mockResolvedValue({
      clientSecret: "pi_secret_test",
      depositId: "dep-1",
      amountCents: 2500,
      currency: "usd",
    });

    render(<PaymentStep {...defaultProps} />);
    fireEvent.click(screen.getByTestId("pay-button"));

    await waitFor(() => {
      expect(screen.getByTestId("alert")).toBeDefined();
      expect(screen.getAllByText(/card declined/i).length).toBeGreaterThan(0);
    });
  });

  it("calls onSuccess with paymentIntentId on success", async () => {
    const { useStripe, useElements } = await import("@stripe/react-stripe-js");
    vi.mocked(useStripe).mockReturnValue({
      confirmCardPayment: vi.fn().mockResolvedValue({
        paymentIntent: { id: "pi_test_123", status: "requires_capture" },
      }),
    } as unknown as ReturnType<typeof useStripe>);
    vi.mocked(useElements).mockReturnValue({
      getElement: vi.fn().mockReturnValue({}),
    } as unknown as ReturnType<typeof useElements>);

    mockApi.publicVenue.depositIntent.mockResolvedValue({
      clientSecret: "pi_secret_test",
      depositId: "dep-1",
      amountCents: 2500,
      currency: "usd",
    });

    render(<PaymentStep {...defaultProps} />);
    fireEvent.click(screen.getByTestId("pay-button"));

    await waitFor(() => {
      expect(defaultProps.onSuccess).toHaveBeenCalledWith("pi_test_123");
    });
  });
});
