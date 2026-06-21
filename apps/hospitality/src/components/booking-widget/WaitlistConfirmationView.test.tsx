/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WaitlistConfirmationView } from "./WaitlistConfirmationView.js";
import React from "react";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Text: ({ children, className }: any) => <span className={className}>{children}</span>,
  Heading: ({ children, className }: any) => <h3 className={className}>{children}</h3>,
}));

describe("WaitlistConfirmationView", () => {
  it("shows position number", () => {
    render(
      <WaitlistConfirmationView position={3} estimatedWaitMinutes={45} onNewBooking={vi.fn()} />
    );
    expect(screen.getByText(/#3/)).toBeDefined();
  });

  it("shows estimated wait time", () => {
    render(
      <WaitlistConfirmationView position={3} estimatedWaitMinutes={45} onNewBooking={vi.fn()} />
    );
    expect(screen.getByText(/45 min/)).toBeDefined();
  });

  it("shows confirmation heading", () => {
    render(
      <WaitlistConfirmationView position={1} estimatedWaitMinutes={15} onNewBooking={vi.fn()} />
    );
    expect(screen.getByText(/Added to Waitlist/i)).toBeDefined();
  });

  it("calls onNewBooking when button is clicked", () => {
    const onNewBooking = vi.fn();
    render(
      <WaitlistConfirmationView
        position={2}
        estimatedWaitMinutes={30}
        onNewBooking={onNewBooking}
      />
    );
    fireEvent.click(screen.getByText(/Make a Reservation/i));
    expect(onNewBooking).toHaveBeenCalled();
  });

  it("shows SMS notification note", () => {
    render(
      <WaitlistConfirmationView position={2} estimatedWaitMinutes={30} onNewBooking={vi.fn()} />
    );
    expect(screen.getByText(/SMS/i)).toBeDefined();
  });
});
