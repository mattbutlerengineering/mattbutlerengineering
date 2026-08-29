import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useAuth } from "@mbe/auth/react";
import { LoginGate } from "./LoginGate.js";
import React from "react";

vi.mock("@mbe/auth/react", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  // Faithful to the real usage: LoginGate passes role="img" + aria-label through
  // DepartureBoard's ...rest to its root div, naming the board for AT.
  DepartureBoard: ({
    phrases,
    role,
    "aria-label": ariaLabel,
  }: {
    phrases: string[];
    role?: string;
    "aria-label"?: string;
  }) => (
    <div role={role} aria-label={ariaLabel}>
      {phrases.join(" ")}
    </div>
  ),
}));

describe("LoginGate", () => {
  const signIn = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      signIn,
    } as unknown as ReturnType<typeof useAuth>);
  });

  it("keeps the login-prompt E2E testid contract", () => {
    render(<LoginGate />);
    expect(screen.getByTestId("login-prompt")).toBeInTheDocument();
  });

  it("renders a button with the exact accessible name 'Sign In'", () => {
    render(<LoginGate />);
    expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
  });

  it("calls signIn when the Sign In button is pressed", () => {
    render(<LoginGate />);
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("renders the departure board as a named image cycling the product domains", () => {
    render(<LoginGate />);
    const board = screen.getByRole("img", {
      name: "Reservations, guests, floor plans, waitlist, and timeline",
    });
    expect(board).toBeInTheDocument();
    expect(board.textContent).toContain("RESERVATIONS");
    expect(board.textContent).toContain("FLOOR PLANS");
  });

  it("renders the app title and tagline", () => {
    render(<LoginGate />);
    expect(screen.getByText("Hospitality")).toBeInTheDocument();
    expect(screen.getByText("Restaurant management, simplified.")).toBeInTheDocument();
  });
});
