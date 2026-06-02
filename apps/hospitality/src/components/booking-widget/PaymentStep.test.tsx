import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";
import { PaymentStep } from "./PaymentStep.js";
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

describe("PaymentStep", () => {
  const defaultProps = {
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

    render(<PaymentStep {...defaultProps} />);
    const payButton = screen.getByTestId("pay-button");
    fireEvent.click(payButton);
    expect(payButton).toBeDisabled();
  });

  it("shows error when payment fails", async () => {
    const { useStripe, useElements } = await import("@stripe/react-stripe-js");
    vi.mocked(useStripe).mockReturnValue({
      confirmCardPayment: vi.fn().mockResolvedValue({ error: { message: "Card declined" } }),
    } as any);
    vi.mocked(useElements).mockReturnValue({
      getElement: vi.fn().mockReturnValue({}),
    } as any);

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ data: { clientSecret: "pi_secret_test", depositId: "dep-1" } }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
    );

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
    } as any);
    vi.mocked(useElements).mockReturnValue({
      getElement: vi.fn().mockReturnValue({}),
    } as any);

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ data: { clientSecret: "pi_secret_test", depositId: "dep-1" } }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
    );

    render(<PaymentStep {...defaultProps} />);
    fireEvent.click(screen.getByTestId("pay-button"));

    await waitFor(() => {
      expect(defaultProps.onSuccess).toHaveBeenCalledWith("pi_test_123");
    });
  });
});
