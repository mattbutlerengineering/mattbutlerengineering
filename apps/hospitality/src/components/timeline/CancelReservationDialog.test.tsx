import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { CancelReservationDialog } from "./CancelReservationDialog.js";
import type { CancellationQuote } from "../../hooks/useCancellationQuote.js";

// Mock scrollIntoView for JSDOM
window.HTMLElement.prototype.scrollIntoView = vi.fn();

describe("CancelReservationDialog", () => {
  const defaultProps = {
    reservationId: "res-123",
    guestName: "John Doe",
    onConfirm: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render the dialog with guest name", () => {
    render(<CancelReservationDialog {...defaultProps} />);
    expect(screen.getAllByText("Cancel Reservation")[0]).toBeDefined();
    expect(screen.getByText(/john doe/i)).toBeDefined();
  });

  it("should render all cancellation reasons", async () => {
    render(<CancelReservationDialog {...defaultProps} />);

    // Open the select
    const trigger = screen.getByRole("combobox", { name: /reason/i });
    fireEvent.click(trigger);

    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByText("Guest Cancelled")).toBeDefined();
    expect(within(listbox).getByText("No Show")).toBeDefined();
    expect(within(listbox).getByText("Restaurant Cancelled")).toBeDefined();
    expect(within(listbox).getByText("Other")).toBeDefined();
  });

  it("should have guest cancelled as default reason", () => {
    render(<CancelReservationDialog {...defaultProps} />);
    const trigger = screen.getByRole("combobox", { name: /reason/i });
    expect(trigger).toHaveTextContent("Guest Cancelled");
  });

  it("should allow selecting different reasons", async () => {
    render(<CancelReservationDialog {...defaultProps} />);

    const trigger = screen.getByRole("combobox", { name: /reason/i });
    fireEvent.click(trigger);

    const option = screen.getByRole("option", { name: "No Show" });
    fireEvent.click(option);

    expect(trigger).toHaveTextContent("No Show");
  });

  it("should allow entering a note", () => {
    render(<CancelReservationDialog {...defaultProps} />);
    const textarea = screen.getByLabelText(/note/i);
    fireEvent.change(textarea, { target: { value: "Test note" } });
    expect((textarea as HTMLTextAreaElement).value).toBe("Test note");
  });

  it("should call onConfirm when Cancel Reservation is clicked", async () => {
    render(<CancelReservationDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel Reservation" }));
    await waitFor(() => {
      expect(defaultProps.onConfirm).toHaveBeenCalledWith("guest_cancelled", "");
    });
  });

  it("should pass reason and note to onConfirm", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<CancelReservationDialog {...defaultProps} onConfirm={onConfirm} />);

    // Select reason
    const trigger = screen.getByRole("combobox", { name: /reason/i });
    fireEvent.click(trigger);
    const option = screen.getByRole("option", { name: "No Show" });
    fireEvent.click(option);

    const textarea = screen.getByLabelText(/note/i);
    fireEvent.change(textarea, { target: { value: "Guest never arrived" } });

    fireEvent.click(screen.getByRole("button", { name: "Cancel Reservation" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith("no_show", "Guest never arrived");
    });
  });

  it("should display error when onConfirm throws", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("Network error"));
    render(<CancelReservationDialog {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel Reservation" }));
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeDefined();
    });
  });

  it("should use default guest name when guestName is null", () => {
    render(<CancelReservationDialog {...defaultProps} guestName={null} />);
    expect(screen.getByText("Guest")).toBeDefined();
  });

  it("should disable buttons when isLoading in onConfirm", async () => {
    let resolveConfirm: (value: void | PromiseLike<void>) => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        })
    );
    render(<CancelReservationDialog {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel Reservation" }));

    await waitFor(() => {
      expect(screen.getByText("Cancelling…")).toBeDefined();
    });

    expect(screen.getByRole("button", { name: "Keep Reservation" })).toBeDisabled();

    await waitFor(() => {
      resolveConfirm!(undefined);
    });
  });

  describe("cancellation fee display", () => {
    // The dialog no longer derives the fee; it renders whatever the quote holds.
    // Fee evaluation + label formatting are unit-tested in useCancellationQuote.
    const freeQuote: CancellationQuote = {
      fee: {
        feeType: "none",
        feeAmountCents: 0,
        refundAmountCents: 5000,
        depositAction: "refund_full",
      },
      label: "No cancellation fee — full refund of $50.00",
      currency: "usd",
    };
    const lateQuote: CancellationQuote = {
      fee: {
        feeType: "late",
        feeAmountCents: 2500,
        refundAmountCents: 2500,
        depositAction: "refund_partial",
      },
      label: "Late cancellation fee: $25.00 — refund $25.00",
      currency: "usd",
    };
    const noShowQuote: CancellationQuote = {
      fee: {
        feeType: "noshow",
        feeAmountCents: 5000,
        refundAmountCents: 0,
        depositAction: "forfeit",
      },
      label: "No-show fee: $50.00 forfeited — refund $0.00",
      currency: "usd",
    };

    it("shows the free-cancellation label", () => {
      render(<CancelReservationDialog {...defaultProps} quote={freeQuote} />);
      expect(screen.getByText(/no cancellation fee/i)).toBeDefined();
      expect(screen.getByText(/\$50\.00/)).toBeDefined();
    });

    it("shows the late-cancellation label", () => {
      render(<CancelReservationDialog {...defaultProps} quote={lateQuote} />);
      expect(screen.getByText(/late cancellation fee/i)).toBeDefined();
      expect(screen.getByText(/\$25\.00/)).toBeDefined();
    });

    it("shows the no-show label", () => {
      render(<CancelReservationDialog {...defaultProps} quote={noShowQuote} />);
      expect(screen.getByText(/no-show fee/i)).toBeDefined();
      expect(screen.getByText(/\$50\.00 forfeited/i)).toBeDefined();
    });

    it("shows no fee section when no quote is provided", () => {
      render(<CancelReservationDialog {...defaultProps} />);
      expect(screen.queryByTestId("cancellation-fee-banner")).toBeNull();
    });
  });
});
