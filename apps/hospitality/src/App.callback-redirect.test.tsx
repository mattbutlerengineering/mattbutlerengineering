import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { signinReturnTo } from "@mbe/auth/react";
import { CallbackRedirect } from "./App.js";
import React from "react";
import type * as AuthReact from "@mbe/auth/react";

// The open-redirect guard on the stored returnTo is owned and tested by
// @mbe/auth's signinReturnTo; here we only assert CallbackRedirect follows it.
vi.mock("@mbe/auth/react", async (importOriginal) => ({
  ...(await importOriginal<typeof AuthReact>()),
  signinReturnTo: vi.fn(),
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

describe("CallbackRedirect", () => {
  it("navigates to the returnTo carried through sign-in, preserving the query string", () => {
    vi.mocked(signinReturnTo).mockReturnValue("/reservations?date=2026-09-01");
    render(
      <MemoryRouter initialEntries={["/callback"]}>
        <Routes>
          <Route path="/callback" element={<CallbackRedirect />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId("location")).toHaveTextContent("/reservations?date=2026-09-01");
  });
});
