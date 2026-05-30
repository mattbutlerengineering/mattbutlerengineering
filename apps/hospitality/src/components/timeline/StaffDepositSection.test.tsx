import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";
import { StaffDepositSection } from "./StaffDepositSection.js";
import { createApiClient } from "@mbe/api-client";
import type { Deposit } from "@mbe/types";

vi.mock("@mbe/api-client", () => ({
  createApiClient: vi.fn(),
}));

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

describe("StaffDepositSection", () => {
  const defaultProps = {
    reservationId: "res-1",
    getAccessToken: vi.fn().mockReturnValue("token"),
  };

  const mockApi = {
    client: {
      postOne: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createApiClient).mockReturnValue(mockApi as any);
  });

  it("shows collect deposit button when no existing deposit", () => {
    render(<StaffDepositSection {...defaultProps} />);
    expect(screen.getByText("+ Collect Deposit")).toBeDefined();
  });

  it("shows existing deposit amount and status", () => {
    render(<StaffDepositSection {...defaultProps} existingDeposit={mockDeposit} />);
    expect(screen.getAllByText(/\$25\.00/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Authorized/)).toBeDefined();
  });

  it("shows deposit form when collect button clicked", () => {
    render(<StaffDepositSection {...defaultProps} />);
    fireEvent.click(screen.getByText("+ Collect Deposit"));
    expect(screen.getByTestId("amount-input")).toBeDefined();
  });

  it("shows error for invalid amount", async () => {
    render(<StaffDepositSection {...defaultProps} />);
    fireEvent.click(screen.getByText("+ Collect Deposit"));
    // Enter zero amount (passes the !amountInput check but fails validation)
    const input = screen.getByTestId("amount-input");
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.click(screen.getByText("Create Deposit"));
    expect(screen.getByTestId("alert")).toBeDefined();
    expect(screen.getByText(/valid amount/i)).toBeDefined();
  });

  it("creates deposit and shows it on success", async () => {
    mockApi.client.postOne.mockResolvedValue({
      ...mockDeposit,
      status: "pending",
      heldAt: null,
    });

    render(<StaffDepositSection {...defaultProps} />);
    fireEvent.click(screen.getByText("+ Collect Deposit"));

    const input = screen.getByTestId("amount-input");
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.click(screen.getByText("Create Deposit"));

    await waitFor(() => {
      expect(screen.getAllByText(/\$25\.00/).length).toBeGreaterThan(0);
    });
    expect(mockApi.client.postOne).toHaveBeenCalledWith("/api/v1/deposits", {
      reservationId: "res-1",
      amountCents: 2500,
      currency: "usd",
    });
  });

  it("shows error when API call fails", async () => {
    mockApi.client.postOne.mockRejectedValue(new Error("Network error"));

    render(<StaffDepositSection {...defaultProps} />);
    fireEvent.click(screen.getByText("+ Collect Deposit"));

    const input = screen.getByTestId("amount-input");
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.click(screen.getByText("Create Deposit"));

    await waitFor(() => {
      expect(screen.getByTestId("alert")).toBeDefined();
      expect(screen.getByText(/Network error/)).toBeDefined();
    });
  });

  it("hides form when cancel clicked", () => {
    render(<StaffDepositSection {...defaultProps} />);
    fireEvent.click(screen.getByText("+ Collect Deposit"));
    expect(screen.getByTestId("amount-input")).toBeDefined();
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByTestId("amount-input")).toBeNull();
  });
});
