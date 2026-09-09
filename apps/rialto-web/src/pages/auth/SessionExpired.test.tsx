import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { SessionExpired } from "./SessionExpired";
import { DEMO_ROUTES } from "../../data/demo-routes";

// Behavioral mock of @mattbutlerengineering/rialto (house pattern) — StatusLED
// exposes its variant/pulse through data attributes so the warning anchor is
// assertable; Handshake mirrors the SignIn.test.tsx stub (role="img" carrying
// data-state); Heading renders a real heading element so getByRole works.
vi.mock("@mattbutlerengineering/rialto", () => {
  const StatusLED = ({
    variant,
    pulse,
    label,
  }: {
    variant?: string;
    pulse?: boolean;
    label?: string;
  }) => (
    <span
      data-testid="status-led"
      data-variant={variant}
      data-pulse={pulse ? "true" : "false"}
      aria-label={label}
    />
  );
  const Button = ({
    children,
    onClick,
    type = "button",
  }: {
    children?: ReactNode;
    onClick?: () => void;
    type?: "button" | "submit";
  }) => (
    <button type={type} onClick={onClick}>
      {children}
    </button>
  );
  const Text = ({ children, className }: { children?: ReactNode; className?: string }) => (
    <p className={className}>{children}</p>
  );
  const Handshake = ({
    "aria-label": ariaLabel,
    state,
  }: {
    "aria-label"?: string;
    state?: string;
  }) => <div role="img" aria-label={ariaLabel} data-state={state} />;
  const Heading = ({ children, level = 2 }: { children?: ReactNode; level?: number }) => {
    const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
    return <Tag>{children}</Tag>;
  };
  return { StatusLED, Button, Text, Handshake, Heading };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[DEMO_ROUTES.sessionExpired]}>
      <Routes>
        <Route path={DEMO_ROUTES.sessionExpired} element={<SessionExpired />} />
        <Route path={DEMO_ROUTES.signIn} element={<div>LOGIN PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("SessionExpired", () => {
  it("renders the session-ended heading and exact demo body copy", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Your session ended" })).toBeInTheDocument();
    expect(screen.getByText("Sign back in to pick up where you left off.")).toBeInTheDocument();
    expect(screen.queryByText(/this page is preserved/i)).not.toBeInTheDocument();
  });

  it("shows the Handshake idle beside the warning StatusLED", () => {
    renderPage();
    const handshake = screen.getByRole("img", {
      name: "Session with Identity has lapsed",
    });
    expect(handshake).toHaveAttribute("data-state", "idle");

    const led = screen.getByTestId("status-led");
    expect(led).toHaveAttribute("data-variant", "warning");
    expect(led).toHaveAttribute("data-pulse", "true");
  });

  it("routes back to the sign-in demo from the primary action", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /sign back in/i }));
    expect(screen.getByText("LOGIN PAGE")).toBeInTheDocument();
  });
});
