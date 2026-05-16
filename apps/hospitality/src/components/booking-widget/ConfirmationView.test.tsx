/* eslint-disable @typescript-eslint/no-explicit-any, react/jsx-no-undef */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmationView } from "./ConfirmationView.js";
import type { Reservation } from "@mbe/types";
import React from "react";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Button: ({ children, onClick, variant }: { children: React.ReactNode; onClick?: () => void; variant?: string }) => (
    <button onClick={onClick} data-variant={variant}>{children}</button>
  ),
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res-abcd1234",
    date: "2026-05-20",
    startTime: "2026-05-20T18:00:00",
    endTime: "2026-05-20T20:00:00",
    partySize: 4,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "John Doe",
    guestEmail: "john@example.com",
    guestPhone: null,
    guestId: null,
    userId: null,
    tableId: "table-1",
    venueId: "venue-1",
    createdAt: "2026-05-20T00:00:00Z",
    updatedAt: "2026-05-20T00:00:00Z",
    ...overrides,
  };
}

describe("ConfirmationView", () => {
  const mockOnNewBooking = vi.fn();

  it("renders reservation confirmed heading", () => {
    render(
      <ConfirmationView reservation={makeReservation()} onNewBooking={mockOnNewBooking} />
    );
    expect(screen.getByText("Reservation Confirmed!")).toBeDefined();
  });

  it("displays the confirmation number from the reservation id", () => {
    render(
      <ConfirmationView reservation={makeReservation()} onNewBooking={mockOnNewBooking} />
    );
    // Last 8 chars of "res-abcd1234" uppercased = "BCD1234" ... actually "ABCD1234"
    expect(screen.getByText("ABCD1234")).toBeDefined();
  });

  it("displays party size with correct pluralization", () => {
    render(
      <ConfirmationView reservation={makeReservation({ partySize: 4 })} onNewBooking={mockOnNewBooking} />
    );
    expect(screen.getByText("4 guests")).toBeDefined();
  });

  it("uses singular 'guest' for party size of 1", () => {
    render(
      <ConfirmationView reservation={makeReservation({ partySize: 1 })} onNewBooking={mockOnNewBooking} />
    );
    expect(screen.getByText("1 guest")).toBeDefined();
  });

  it("displays guest name when present", () => {
    render(
      <ConfirmationView reservation={makeReservation({ guestName: "Jane Smith" })} onNewBooking={mockOnNewBooking} />
    );
    expect(screen.getByText("Jane Smith")).toBeDefined();
  });

  it("does not display name row when guestName is null", () => {
    render(
      <ConfirmationView reservation={makeReservation({ guestName: null })} onNewBooking={mockOnNewBooking} />
    );
    expect(screen.queryByText("Name")).toBeNull();
  });

  it("displays email confirmation notice when guestEmail exists", () => {
    render(
      <ConfirmationView
        reservation={makeReservation({ guestEmail: "john@example.com" })}
        onNewBooking={mockOnNewBooking}
      />
    );
    expect(screen.getByText(/A confirmation has been sent to/)).toBeDefined();
    expect(screen.getByText(/john@example.com/)).toBeDefined();
  });

  it("displays phone confirmation notice when only guestPhone exists", () => {
    render(
      <ConfirmationView
        reservation={makeReservation({ guestEmail: null, guestPhone: "+15551234" })}
        onNewBooking={mockOnNewBooking}
      />
    );
    expect(screen.getByText(/\+15551234/)).toBeDefined();
  });

  it("does not display confirmation notice when no email or phone", () => {
    render(
      <ConfirmationView
        reservation={makeReservation({ guestEmail: null, guestPhone: null })}
        onNewBooking={mockOnNewBooking}
      />
    );
    expect(screen.queryByText(/A confirmation has been sent/)).toBeNull();
  });

  it("calls onNewBooking when 'Make Another Reservation' is clicked", () => {
    render(
      <ConfirmationView reservation={makeReservation()} onNewBooking={mockOnNewBooking} />
    );
    fireEvent.click(screen.getByText("Make Another Reservation"));
    expect(mockOnNewBooking).toHaveBeenCalled();
  });

  it("shows cancel button when onCancellation is provided", () => {
    const mockCancel = vi.fn();
    render(
      <ConfirmationView
        reservation={makeReservation()}
        onNewBooking={mockOnNewBooking}
        onCancellation={mockCancel}
      />
    );
    expect(screen.getByText("Cancel Reservation")).toBeDefined();
  });

  it("calls onCancellation when cancel button is clicked", () => {
    const mockCancel = vi.fn();
    render(
      <ConfirmationView
        reservation={makeReservation()}
        onNewBooking={mockOnNewBooking}
        onCancellation={mockCancel}
      />
    );
    fireEvent.click(screen.getByText("Cancel Reservation"));
    expect(mockCancel).toHaveBeenCalled();
  });

  it("navigates to cancellationUrl when provided", () => {
    const originalLocation = window.location.href;
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: originalLocation },
    });

    render(
      <ConfirmationView
        reservation={makeReservation()}
        onNewBooking={mockOnNewBooking}
        cancellationUrl="https://example.com/cancel"
      />
    );
    fireEvent.click(screen.getByText("Cancel Reservation"));
    expect(window.location.href).toBe("https://example.com/cancel");
  });

  it("does not show cancel button when neither cancellationUrl nor onCancellation is provided", () => {
    render(
      <ConfirmationView reservation={makeReservation()} onNewBooking={mockOnNewBooking} />
    );
    expect(screen.queryByText("Cancel Reservation")).toBeNull();
  });

  it("displays table info when reservation has a table", () => {
    const resWithTable = {
      ...makeReservation(),
      table: { id: "t1", name: "Patio 1", tableNumber: "T1" },
    } as any;

    render(
      <ConfirmationView reservation={resWithTable} onNewBooking={mockOnNewBooking} />
    );
    expect(screen.getByText("T1")).toBeDefined();
  });

  it("uses table name as fallback when tableNumber is not available", () => {
    const resWithTable = {
      ...makeReservation(),
      table: { id: "t1", name: "Patio Corner", tableNumber: "" },
    } as any;

    render(
      <ConfirmationView reservation={resWithTable} onNewBooking={mockOnNewBooking} />
    );
    expect(screen.getByText("Patio Corner")).toBeDefined();
  });
});
