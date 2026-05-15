import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReservationBlock } from "./ReservationBlock.js";
import type { Reservation } from "@mbe/types";

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res-1",
    date: "2026-05-14",
    startTime: "2026-05-14T18:00:00.000Z",
    endTime: "2026-05-14T20:00:00.000Z",
    partySize: 4,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Jane Doe",
    guestEmail: null,
    guestPhone: null,
    guestId: null,
    userId: null,
    tableId: "table-1",
    venueId: null,
    createdAt: "2026-05-14T10:00:00.000Z",
    updatedAt: "2026-05-14T10:00:00.000Z",
    ...overrides,
  };
}

const defaultStyle = { left: 100, width: 200 };

describe("ReservationBlock", () => {
  it("renders guest name and party size", () => {
    render(<ReservationBlock reservation={makeReservation()} style={defaultStyle} />);
    expect(screen.getByText("Jane Doe")).toBeDefined();
    expect(screen.getByText(/4/)).toBeDefined();
  });

  it("renders fallback text when guest name is null", () => {
    render(
      <ReservationBlock reservation={makeReservation({ guestName: null })} style={defaultStyle} />
    );
    expect(screen.getByText("Guest")).toBeDefined();
  });

  it("applies PENDING status class", () => {
    render(
      <ReservationBlock reservation={makeReservation({ status: "PENDING" })} style={defaultStyle} />
    );
    const button = screen.getByRole("button");
    expect(button.className).toContain("statusPending");
  });

  it("applies CONFIRMED status class", () => {
    render(
      <ReservationBlock
        reservation={makeReservation({ status: "CONFIRMED" })}
        style={defaultStyle}
      />
    );
    const button = screen.getByRole("button");
    expect(button.className).toContain("statusConfirmed");
  });

  it("applies CANCELLED status class", () => {
    render(
      <ReservationBlock
        reservation={makeReservation({ status: "CANCELLED" })}
        style={defaultStyle}
      />
    );
    const button = screen.getByRole("button");
    expect(button.className).toContain("statusCancelled");
  });

  it("applies COMPLETED status class", () => {
    render(
      <ReservationBlock
        reservation={makeReservation({ status: "COMPLETED" })}
        style={defaultStyle}
      />
    );
    const button = screen.getByRole("button");
    expect(button.className).toContain("statusCompleted");
  });

  it("applies NO_SHOW status class", () => {
    render(
      <ReservationBlock reservation={makeReservation({ status: "NO_SHOW" })} style={defaultStyle} />
    );
    const button = screen.getByRole("button");
    expect(button.className).toContain("statusNoShow");
  });

  it("fires click handler when clicked", () => {
    const handleClick = vi.fn();
    render(
      <ReservationBlock
        reservation={makeReservation()}
        style={defaultStyle}
        onClick={handleClick}
      />
    );
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it("applies selected class when isSelected is true", () => {
    render(<ReservationBlock reservation={makeReservation()} style={defaultStyle} isSelected />);
    const button = screen.getByRole("button");
    expect(button.className).toContain("blockSelected");
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("does not apply selected class when isSelected is false", () => {
    render(<ReservationBlock reservation={makeReservation()} style={defaultStyle} />);
    const button = screen.getByRole("button");
    expect(button.className).not.toContain("blockSelected");
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("applies focused class when isFocused is true", () => {
    render(<ReservationBlock reservation={makeReservation()} style={defaultStyle} isFocused />);
    const button = screen.getByRole("button");
    expect(button.className).toContain("blockFocused");
  });

  it("sets inline style from style prop", () => {
    render(<ReservationBlock reservation={makeReservation()} style={{ left: 50, width: 300 }} />);
    const button = screen.getByRole("button");
    expect(button.style.left).toBe("50px");
    expect(button.style.width).toBe("300px");
  });

  it("sets accessible title with guest name, party size, and time", () => {
    render(<ReservationBlock reservation={makeReservation()} style={defaultStyle} />);
    const button = screen.getByRole("button");
    expect(button.title).toContain("Jane Doe");
    expect(button.title).toContain("4 guests");
  });

  it("sets aria-label with reservation details", () => {
    render(<ReservationBlock reservation={makeReservation()} style={defaultStyle} />);
    const button = screen.getByRole("button");
    const label = button.getAttribute("aria-label") ?? "";
    expect(label).toContain("Jane Doe");
    expect(label).toContain("party of 4");
    expect(label).toContain("confirmed");
  });
});
