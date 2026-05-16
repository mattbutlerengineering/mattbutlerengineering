import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { App } from "./App.js";
import React from "react";

vi.mock("@mbe/auth/react", () => ({
  useAuth: vi.fn(),
}));

vi.mock("./hooks/use-theme.js", () => ({
  useTheme: vi.fn(() => ({ theme: "system", setTheme: vi.fn() })),
  resolveTheme: vi.fn((t) => (t === "system" ? "light" : t)),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
  GlobalNav: () => <nav data-testid="global-nav" />,
  Footer: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer>,
  AuthMascot: () => <div data-testid="mascot" />,
  resolveTheme: vi.fn((t) => t),
}));

vi.mock("./pages/LoadingPage", () => ({
  LoadingPage: () => <div data-testid="loading-page" />,
}));

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderApp = (initialPath = "/") => {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    );
  };

  it("renders loading page when auth is loading", () => {
    vi.mocked(useAuth).mockReturnValue({ isLoading: true } as any);
    renderApp();
    expect(screen.getByTestId("loading-page")).toBeDefined();
  });

  it("renders error page when auth fails", () => {
    vi.mocked(useAuth).mockReturnValue({ 
      isLoading: false, 
      error: new Error("Auth Failed") 
    } as any);
    renderApp();
    expect(screen.getByText("Authentication Error")).toBeDefined();
    expect(screen.getByText("Auth Failed")).toBeDefined();
  });

  it("renders login mascot when not authenticated", () => {
    vi.mocked(useAuth).mockReturnValue({ 
      isLoading: false, 
      isAuthenticated: false,
      loginWithRedirect: vi.fn(),
    } as any);
    renderApp();
    expect(screen.getByTestId("mascot")).toBeDefined();
    expect(screen.getByText("Sign In")).toBeDefined();
  });

  it("renders Outlet when authenticated", () => {
    vi.mocked(useAuth).mockReturnValue({ 
      isLoading: false, 
      isAuthenticated: true 
    } as any);
    // Outlet is harder to test directly here, but we can verify UnauthenticatedShell is NOT rendered
    const { container } = renderApp();
    expect(container.querySelector("footer")).toBeNull();
  });
});
