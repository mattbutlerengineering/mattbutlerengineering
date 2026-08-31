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
  Button: ({
    children,
    onClick,
    isLoading,
    loadingText,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    isLoading?: boolean;
    loadingText?: string;
  }) => (
    <button onClick={onClick} aria-busy={isLoading || undefined} disabled={isLoading}>
      {isLoading && loadingText ? loadingText : children}
    </button>
  ),
  Handshake: ({
    "aria-label": ariaLabel,
    stations,
    state,
  }: {
    "aria-label": string;
    stations: readonly string[];
    state?: string;
  }) => (
    <div role="img" aria-label={ariaLabel} data-state={state}>
      {stations.join(" ")}
    </div>
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
      activeNavigator: undefined,
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

  describe("while the sign-in redirect is in flight", () => {
    beforeEach(() => {
      vi.mocked(useAuth).mockReturnValue({
        isLoading: false,
        isAuthenticated: false,
        activeNavigator: "signinRedirect",
        signIn,
      } as unknown as ReturnType<typeof useAuth>);
    });

    it("keeps the login-prompt testid but marks the button busy with a departure label", () => {
      render(<LoginGate />);
      expect(screen.getByTestId("login-prompt")).toBeInTheDocument();
      const button = screen.getByRole("button", { name: "Heading to sign-in" });
      expect(button).toHaveAttribute("aria-busy", "true");
      expect(screen.queryByRole("button", { name: "Sign In" })).not.toBeInTheDocument();
    });

    it("swaps the departure board for the handshake so the redirect reads as a live exchange", () => {
      render(<LoginGate />);
      expect(
        screen.getByRole("img", { name: "Connecting your browser to Identity" })
      ).toHaveAttribute("data-state", "negotiating");
      expect(
        screen.queryByRole("img", {
          name: "Reservations, guests, floor plans, waitlist, and timeline",
        })
      ).not.toBeInTheDocument();
    });
  });

  describe("when signedOut is true", () => {
    it("renders the signed-out tagline instead of the default tagline", () => {
      render(<LoginGate signedOut />);
      expect(
        screen.getByText("You're signed out. Sign in again whenever you're ready.")
      ).toBeInTheDocument();
      expect(screen.queryByText("Restaurant management, simplified.")).not.toBeInTheDocument();
    });

    it("keeps the login-prompt testid and the Sign In button contract", () => {
      render(<LoginGate signedOut />);
      expect(screen.getByTestId("login-prompt")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
    });

    it("still renders the departure board at rest", () => {
      render(<LoginGate signedOut />);
      expect(
        screen.getByRole("img", {
          name: "Reservations, guests, floor plans, waitlist, and timeline",
        })
      ).toBeInTheDocument();
    });
  });
});
