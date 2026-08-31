import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useAuth } from "@mbe/auth/react";
import { AuthFailurePage } from "./AuthFailurePage.js";
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
    lane,
  }: {
    "aria-label": string;
    stations: readonly string[];
    state?: string;
    lane?: number;
  }) => (
    <div role="img" aria-label={ariaLabel} data-state={state} data-lane={lane}>
      {stations.join(" ")}
    </div>
  ),
}));

describe("AuthFailurePage", () => {
  const signIn = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      signIn,
      activeNavigator: undefined,
    } as unknown as ReturnType<typeof useAuth>);
  });

  const categories = [
    {
      name: "access denied",
      error: Object.assign(new Error("not permitted"), { error: "access_denied" }),
      title: "Access denied",
      canRetry: false,
    },
    {
      name: "expired flow",
      error: new Error("No matching state found in storage"),
      title: "That sign-in link expired",
      canRetry: true,
    },
    {
      name: "network",
      error: new Error("Failed to fetch"),
      title: "Can't reach the sign-in service",
      canRetry: true,
    },
    {
      name: "default",
      error: new Error("Auth Failed"),
      title: "Sign-in hit a snag",
      canRetry: true,
    },
  ] as const;

  describe.each(categories)("$name category", ({ error, title, canRetry }) => {
    it.each([0, 1] as const)("renders the failed handshake in place for lane %i", (lane) => {
      render(<AuthFailurePage error={error} lane={lane} />);

      const handshake = screen.getByRole("img", {
        name: "Your sign-in could not be verified",
      });
      expect(handshake).toHaveAttribute("data-state", "failed");
      expect(handshake).toHaveAttribute("data-lane", String(lane));

      expect(screen.getByText(title)).toBeInTheDocument();

      const details = screen.getByText("Technical details").closest("details");
      expect(details).toHaveTextContent(error.message);
    });

    it(`${canRetry ? "shows" : "omits"} the "Try again" retry action`, () => {
      render(<AuthFailurePage error={error} lane={0} />);
      const retryButton = screen.queryByRole("button", { name: "Try again" });
      if (canRetry) {
        expect(retryButton).toBeInTheDocument();
      } else {
        expect(retryButton).toBeNull();
      }
    });
  });

  it("announces the exchange failure without repeating the image label", () => {
    render(<AuthFailurePage error={new Error("Auth Failed")} lane={0} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("The exchange didn't go through");
  });

  it("calls signIn exactly once with no arguments when Try again is clicked", () => {
    render(<AuthFailurePage error={new Error("Auth Failed")} lane={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenCalledWith();
  });

  it("switches to a negotiating variant while a retry is in flight", () => {
    vi.mocked(useAuth).mockReturnValue({
      signIn,
      activeNavigator: "signinRedirect",
    } as unknown as ReturnType<typeof useAuth>);
    render(<AuthFailurePage error={new Error("Auth Failed")} lane={1} />);

    const handshake = screen.getByRole("img", {
      name: "Connecting your browser to Identity",
    });
    expect(handshake).toHaveAttribute("data-state", "negotiating");
    expect(handshake).toHaveAttribute("data-lane", "0");

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Starting a fresh sign-in");

    const button = screen.getByRole("button", { name: "Heading to sign-in" });
    expect(button).toHaveAttribute("aria-busy", "true");

    // Heading stays rendered so nothing jumps.
    expect(screen.getByText("Sign-in hit a snag")).toBeInTheDocument();
  });
});
