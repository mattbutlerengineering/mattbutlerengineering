import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
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
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  GlobalNav: () => <nav data-testid="global-nav" />,
  Footer: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer>,
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
  resolveTheme: vi.fn((t) => t),
}));

vi.mock("./pages/LoadingPage", () => ({
  LoadingPage: () => <div data-testid="loading-page" />,
}));

vi.mock("./components/CallbackPage", () => ({
  CallbackPage: () => <div data-testid="callback-page" />,
}));

vi.mock("./components/SessionExpiredGate", () => ({
  SessionExpiredGate: () => <div data-testid="session-expired" />,
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
    vi.mocked(useAuth).mockReturnValue({ isLoading: true } as ReturnType<typeof useAuth>);
    renderApp();
    expect(screen.getByTestId("loading-page")).toBeDefined();
  });

  it("renders a categorized error page when auth fails", () => {
    vi.mocked(useAuth).mockReturnValue({
      isLoading: false,
      error: new Error("Auth Failed"),
    } as ReturnType<typeof useAuth>);
    renderApp();
    // "Auth Failed" matches no category — falls back to the generic headline.
    expect(screen.getByText("Sign-in hit a snag")).toBeDefined();
    expect(screen.getByText("Try Again")).toBeDefined();
    // Raw message stays available for debugging, demoted to the details line.
    expect(screen.getByText("Auth Failed")).toBeDefined();
    expect(screen.getByText("Technical details")).toBeDefined();
  });

  it("omits the retry action for access-denied errors", () => {
    vi.mocked(useAuth).mockReturnValue({
      isLoading: false,
      error: Object.assign(new Error("not permitted"), { error: "access_denied" }),
    } as ReturnType<typeof useAuth>);
    renderApp();
    expect(screen.getByText("Access denied")).toBeDefined();
    expect(screen.queryByText("Try Again")).toBeNull();
    expect(screen.getByText("not permitted")).toBeDefined();
  });

  it("renders login gate when not authenticated", () => {
    vi.mocked(useAuth).mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      signIn: vi.fn(),
    } as ReturnType<typeof useAuth>);
    renderApp();
    expect(screen.getByTestId("login-prompt")).toBeDefined();
    expect(screen.getByText("Sign In")).toBeDefined();
    expect(screen.getByText("Hospitality")).toBeDefined();
  });

  it("renders Outlet when authenticated", () => {
    vi.mocked(useAuth).mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);
    // Outlet is harder to test directly here, but we can verify UnauthenticatedShell is NOT rendered
    const { container } = renderApp();
    expect(container.querySelector("footer")).toBeNull();
  });

  it("wraps authenticated view in a flex column layout for scroll containment", () => {
    vi.mocked(useAuth).mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);
    renderApp();
    const wrapper = screen.getByTestId("auth-layout");
    expect(wrapper).toBeDefined();
    expect(wrapper.className).toContain("authLayout");
  });

  describe("session lifecycle", () => {
    it("renders the callback handshake instead of the generic loader while OIDC finishes on /callback", () => {
      window.history.replaceState({}, "", "/hospitality/callback?code=abc&state=xyz");
      vi.mocked(useAuth).mockReturnValue({
        isLoading: true,
        isAuthenticated: false,
      } as ReturnType<typeof useAuth>);
      renderApp("/callback");
      expect(screen.getByTestId("callback-page")).toBeDefined();
      expect(screen.queryByTestId("loading-page")).toBeNull();
    });

    it("keeps the callback handshake up after loading settles but before the user lands", () => {
      window.history.replaceState({}, "", "/hospitality/callback?code=abc&state=xyz");
      vi.mocked(useAuth).mockReturnValue({
        isLoading: false,
        isAuthenticated: false,
      } as ReturnType<typeof useAuth>);
      renderApp("/callback");
      expect(screen.getByTestId("callback-page")).toBeDefined();
      expect(screen.queryByTestId("login-prompt")).toBeNull();
    });

    it("renders the session-expired gate ahead of the dashboard once the token lapses", () => {
      window.history.replaceState({}, "", "/hospitality/reservations");
      vi.mocked(useAuth).mockReturnValue({
        isLoading: false,
        isAuthenticated: true,
        sessionExpired: true,
      } as ReturnType<typeof useAuth>);
      renderApp("/reservations");
      expect(screen.getByTestId("session-expired")).toBeDefined();
      expect(screen.queryByTestId("auth-layout")).toBeNull();
    });

    it("keeps the dashboard mounted through a silent refresh (isLoading stays false)", () => {
      window.history.replaceState({}, "", "/hospitality/reservations");
      vi.mocked(useAuth).mockReturnValue({
        isLoading: false,
        isAuthenticated: true,
        isRefreshing: true,
        activeNavigator: "signinSilent",
      } as ReturnType<typeof useAuth>);
      renderApp("/reservations");
      expect(screen.getByTestId("auth-layout")).toBeDefined();
      expect(screen.queryByTestId("loading-page")).toBeNull();
    });
  });
});
