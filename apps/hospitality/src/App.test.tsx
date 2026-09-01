import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { useAuth } from "@mbe/auth/react";
import { describeAuthError } from "./lib/describe-auth-error.js";
import { App } from "./App.js";
import React from "react";
import type * as AuthReact from "@mbe/auth/react";

vi.mock("@mbe/auth/react", async (importOriginal) => ({
  ...(await importOriginal<typeof AuthReact>()),
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

vi.mock("./pages/AuthFailurePage", async () => {
  const { describeAuthError: describe } = await import("./lib/describe-auth-error.js");
  return {
    AuthFailurePage: ({ error, lane }: { error: Error; lane: 0 | 1 }) => (
      <div data-testid="auth-failure" data-lane={lane}>
        {describe(error).body}
      </div>
    ),
  };
});

vi.mock("./pages/SignOutPage", () => ({
  SignOutPage: () => <div data-testid="sign-out-page" />,
}));

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
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

  describe("document title", () => {
    beforeEach(() => {
      // Mirrors index.html's static default, present before any effect runs.
      document.title = "Dashboard - Matt Butler Engineering";
    });

    it("titles the unauthenticated landing 'Hospitality', not 'Dashboard'", () => {
      vi.mocked(useAuth).mockReturnValue({
        isLoading: false,
        isAuthenticated: false,
        signIn: vi.fn(),
      } as ReturnType<typeof useAuth>);
      renderApp();
      expect(document.title).toBe("Hospitality - Matt Butler Engineering");
    });

    it("keeps the authenticated dashboard's 'Dashboard' title", () => {
      vi.mocked(useAuth).mockReturnValue({
        isLoading: false,
        isAuthenticated: true,
      } as ReturnType<typeof useAuth>);
      renderApp();
      expect(document.title).toBe("Dashboard - Matt Butler Engineering");
    });
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

  describe("failed exchange", () => {
    it("renders the failure page in place on a failed callback exchange (lane 1)", () => {
      window.history.replaceState({}, "", "/hospitality/callback?code=abc&state=xyz");
      const err = new Error("Auth Failed");
      vi.mocked(useAuth).mockReturnValue({
        isLoading: false,
        error: err,
      } as ReturnType<typeof useAuth>);
      renderApp("/callback");
      const failure = screen.getByTestId("auth-failure");
      expect(failure).toBeDefined();
      expect(failure.getAttribute("data-lane")).toBe("1");
      expect(screen.getByText(describeAuthError(err).body)).toBeDefined();
      expect(screen.queryByTestId("callback-page")).toBeNull();
      expect(screen.queryByTestId("login-prompt")).toBeNull();
    });

    it("renders the failure page in place on a failed interactive sign-in (lane 0)", () => {
      window.history.replaceState({}, "", "/hospitality/reservations");
      const err = Object.assign(new Error("not permitted"), { error: "access_denied" });
      vi.mocked(useAuth).mockReturnValue({
        isLoading: false,
        error: err,
      } as ReturnType<typeof useAuth>);
      renderApp("/reservations");
      const failure = screen.getByTestId("auth-failure");
      expect(failure).toBeDefined();
      expect(failure.getAttribute("data-lane")).toBe("0");
      expect(screen.getByText(describeAuthError(err).body)).toBeDefined();
    });
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

    it("renders the signed-out login gate when a sign-out round-trip lands on /callback with no OIDC params", () => {
      window.history.replaceState({}, "", "/hospitality/callback");
      vi.mocked(useAuth).mockReturnValue({
        isLoading: false,
        isAuthenticated: false,
        signIn: vi.fn(),
      } as ReturnType<typeof useAuth>);
      renderApp("/callback");
      expect(screen.getByTestId("login-prompt")).toBeDefined();
      expect(
        screen.getByText("You're signed out. Sign in again whenever you're ready.")
      ).toBeDefined();
      expect(screen.queryByTestId("callback-page")).toBeNull();
      expect(screen.getByRole("button", { name: "Sign In" })).toBeDefined();
    });

    it("renders the sign-out handshake while a sign-out redirect is in flight", () => {
      vi.mocked(useAuth).mockReturnValue({
        isLoading: true,
        isAuthenticated: false,
        activeNavigator: "signoutRedirect",
      } as ReturnType<typeof useAuth>);
      renderApp();
      expect(screen.getByTestId("sign-out-page")).toBeDefined();
      expect(screen.queryByTestId("loading-page")).toBeNull();
      expect(screen.queryByTestId("callback-page")).toBeNull();
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
