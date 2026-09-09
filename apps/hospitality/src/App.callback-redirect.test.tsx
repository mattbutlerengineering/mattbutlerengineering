import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { CallbackRedirect } from "./App.js";
import { rememberReturnTo } from "./return-to-store.js";
import React from "react";
import type * as AuthReact from "@mbe/auth/react";

// Keep the real isSafeReturnTo (open-redirect guard) — only stub the hook the
// App component uses, which CallbackRedirect itself does not.
vi.mock("@mbe/auth/react", async (importOriginal) => ({
  ...(await importOriginal<typeof AuthReact>()),
  useAuth: vi.fn(),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  GlobalNav: () => <nav />,
  Footer: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer>,
  resolveTheme: vi.fn((t) => t),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

const renderCallback = () =>
  render(
    <MemoryRouter initialEntries={["/callback"]}>
      <Routes>
        <Route path="/callback" element={<CallbackRedirect />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );

describe("CallbackRedirect", () => {
  beforeEach(() => {
    rememberReturnTo(undefined);
  });

  it("navigates to the stored returnTo, preserving the query string", () => {
    rememberReturnTo("/reservations?date=2026-09-01");
    renderCallback();
    expect(screen.getByTestId("location")).toHaveTextContent("/reservations?date=2026-09-01");
  });

  it("navigates home when no returnTo is stored", () => {
    renderCallback();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/);
  });

  it("navigates home instead of an unsafe stored value (open-redirect guard)", () => {
    rememberReturnTo("//evil.com");
    renderCallback();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/);
  });

  it("navigates home instead of an absolute URL stored value", () => {
    rememberReturnTo("https://evil.com/phish");
    renderCallback();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/);
  });
});
