import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { CancelReservationDialog } from "./CancelReservationDialog.js";
import type { CancellationPolicy } from "../../utils/cancellation-fee.js";

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
    // reservationTime is 4 hours from now → within a 24h free window (free)
    const futureReservation = new Date(Date.now() + 4 * 60 * 60 * 1000);
    // pastReservation is 1 hour ago → no-show
    const pastReservation = new Date(Date.now() - 1 * 60 * 60 * 1000);
    // lateReservation is 1 hour from now → within free window... let&apos;s use 2h free window
    // so "late" = 1h from now with 2h free window (too late but before reservation)
    const lateReservation = new Date(Date.now() + 1 * 60 * 60 * 1000);

    const basePolicy: CancellationPolicy = {
      depositAmountCents: 5000,
      freeCancellationHours: 2,
      lateCancellationFeePercent: 50,
      noShowFeePercent: 100,
    };

    it("shows no fee for free cancellation (within free window)", () => {
      // 4h from now with 2h free window → free
      render(
        <CancelReservationDialog
          {...defaultProps}
          policy={basePolicy}
          reservationTime={futureReservation}
          currency="usd"
        />
      );
      expect(screen.getByText(/no cancellation fee/i)).toBeDefined();
      expect(screen.getByText(/\$50\.00/)).toBeDefined();
    });

    it("shows late cancellation fee", () => {
      // 1h from now with 2h free window → late
      render(
        <CancelReservationDialog
          {...defaultProps}
          policy={basePolicy}
          reservationTime={lateReservation}
          currency="usd"
        />
      );
      expect(screen.getByText(/late cancellation fee/i)).toBeDefined();
      expect(screen.getByText(/\$25\.00/)).toBeDefined();
    });

    it("shows no-show fee", () => {
      render(
        <CancelReservationDialog
          {...defaultProps}
          policy={basePolicy}
          reservationTime={pastReservation}
          currency="usd"
        />
      );
      expect(screen.getByText(/no-show fee/i)).toBeDefined();
      expect(screen.getByText(/\$50\.00 forfeited/i)).toBeDefined();
    });

    it("shows no fee when policy is not provided", () => {
      render(<CancelReservationDialog {...defaultProps} />);
      // No fee section at all
      expect(screen.queryByText(/cancellation fee/i)).toBeNull();
    });
  });
});
