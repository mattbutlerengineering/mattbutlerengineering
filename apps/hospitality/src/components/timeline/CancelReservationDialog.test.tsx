import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CancelReservationDialog } from "./CancelReservationDialog.js";

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
    expect(screen.getByText("Cancel Reservation")).toBeDefined();
    expect(screen.getByText(/john doe/i)).toBeDefined();
  });

  it("should render all cancellation reasons", () => {
    render(<CancelReservationDialog {...defaultProps} />);
    expect(screen.getByText("Guest Cancelled")).toBeDefined();
    expect(screen.getByText("No Show")).toBeDefined();
    expect(screen.getByText("Restaurant Cancelled")).toBeDefined();
    expect(screen.getByText("Other")).toBeDefined();
  });

  it("should have guest cancelled as default reason", () => {
    render(<CancelReservationDialog {...defaultProps} />);
    const select = screen.getByLabelText(/reason/i) as HTMLSelectElement;
    expect(select.value).toBe("guest_cancelled");
  });

  it("should allow selecting different reasons", () => {
    render(<CancelReservationDialog {...defaultProps} />);
    const select = screen.getByLabelText(/reason/i);
    fireEvent.change(select, { target: { value: "no_show" } });
    expect((select as HTMLSelectElement).value).toBe("no_show");
  });

  it("should allow entering a note", () => {
    render(<CancelReservationDialog {...defaultProps} />);
    const textarea = screen.getByLabelText(/note/i);
    fireEvent.change(textarea, { target: { value: "Test note" } });
    expect((textarea as HTMLTextAreaElement).value).toBe("Test note");
  });

  it("should call onClose when Keep Reservation is clicked", () => {
    render(<CancelReservationDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("Keep Reservation"));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it("should call onConfirm when Cancel Reservation is clicked", async () => {
    render(<CancelReservationDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("Cancel Reservation"));
    await expect(defaultProps.onConfirm).toHaveBeenCalledWith("guest_cancelled", "");
  });

  it("should pass reason and note to onConfirm", async () => {
    render(<CancelReservationDialog {...defaultProps} />);
    const select = screen.getByLabelText(/reason/i);
    fireEvent.change(select, { target: { value: "no_show" } });
    const textarea = screen.getByLabelText(/note/i);
    fireEvent.change(textarea, { target: { value: "Guest never arrived" } });
    fireEvent.click(screen.getByText("Cancel Reservation"));
    await expect(defaultProps.onConfirm).toHaveBeenCalledWith("no_show", "Guest never arrived");
  });

  it("should display error when onConfirm throws", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("Network error"));
    render(<CancelReservationDialog {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Cancel Reservation"));
    await vi.waitFor(() => {
      expect(screen.getByText("Network error")).toBeDefined();
    });
  });

  it("should use default guest name when guestName is null", () => {
    render(<CancelReservationDialog {...defaultProps} guestName={null} />);
    expect(screen.getByText(/guest/i)).toBeDefined();
  });

  it("should disable buttons when isLoading in onConfirm", async () => {
    let resolveConfirm: () => void;
    const onConfirm = vi.fn(() => new Promise((resolve) => {
      resolveConfirm = resolve;
    }));
    render(<CancelReservationDialog {...defaultProps} onConfirm={onConfirm} />);
    
    fireEvent.click(screen.getByText("Cancel Reservation"));
    
    expect(screen.getByText("Cancelling…")).toBeDefined();
    expect(screen.getByText("Keep Reservation")).toBeDisabled();
    
    resolveConfirm!();
  });
});