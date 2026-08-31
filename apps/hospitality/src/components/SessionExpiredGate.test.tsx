import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useAuth } from "@mbe/auth/react";
import { SessionExpiredGate } from "./SessionExpiredGate.js";
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
}));

describe("SessionExpiredGate", () => {
  const signIn = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      signIn,
      activeNavigator: undefined,
    } as unknown as ReturnType<typeof useAuth>);
  });

  it("explains that the session ended and shows the handshake as idle", () => {
    render(<SessionExpiredGate />);
    expect(screen.getByTestId("session-expired")).toBeInTheDocument();
    expect(screen.getByText("Your session ended")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Session with Identity has lapsed" })).toHaveAttribute(
      "data-state",
      "idle"
    );
  });

  it("re-authenticates with the default returnTo so @mbe/auth restores the current page", () => {
    render(<SessionExpiredGate />);
    fireEvent.click(screen.getByRole("button", { name: "Sign back in" }));
    // No explicit returnTo: useAuth().signIn derives it from window.location,
    // which is the contract that preserves the page through the round-trip.
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenCalledWith();
  });

  it("shows the redirect in flight once sign-in has started", () => {
    vi.mocked(useAuth).mockReturnValue({
      signIn,
      activeNavigator: "signinRedirect",
    } as unknown as ReturnType<typeof useAuth>);
    render(<SessionExpiredGate />);
    const button = screen.getByRole("button", { name: "Heading to sign-in" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("img", { name: "Session with Identity has lapsed" })).toHaveAttribute(
      "data-state",
      "negotiating"
    );
  });
});
