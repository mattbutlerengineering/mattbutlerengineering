import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { SessionExpired } from "./SessionExpired";
import { DEMO_ROUTES } from "../../data/demo-routes";

// Behavioral mock of @mattbutlerengineering/rialto (house pattern) — StatusLED
// exposes its variant/pulse through data attributes so the warning anchor is
// assertable.
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
  return { StatusLED, Button, Text };
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
  it("renders the session-ended copy", () => {
    renderPage();
    expect(screen.getByText(/sign back in to pick up where you left off/i)).toBeInTheDocument();
  });

  it("anchors the page with a pulsing warning StatusLED", () => {
    renderPage();
    const led = screen.getByTestId("status-led");
    expect(led).toHaveAttribute("data-variant", "warning");
    expect(led).toHaveAttribute("data-pulse", "true");
  });

  it("routes back to the sign-in demo from the primary action", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(screen.getByText("LOGIN PAGE")).toBeInTheDocument();
  });
});
