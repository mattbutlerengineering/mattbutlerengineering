import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { useAuth, useAuthGate } from "@mbe/auth/react";
import type { AuthGate } from "@mbe/auth/react";
import { describeAuthError } from "./lib/describe-auth-error.js";
import { App } from "./App.js";
import React from "react";
import type * as AuthReact from "@mbe/auth/react";

type AuthState = ReturnType<typeof useAuth>;

/** A signed-out, settled auth state — LoginGate reads signIn from it. */
function authState(): AuthState {
  return {
    isLoading: false,
    activeNavigator: undefined,
    isRefreshing: false,
    sessionExpired: false,
    isAuthenticated: false,
    user: null,
    accessToken: null,
    signIn: vi.fn<AuthState["signIn"]>(),
    signOut: vi.fn<AuthState["signOut"]>(),
    signInSilent: vi.fn<AuthState["signInSilent"]>(),
    error: undefined,
    refreshError: null,
  };
}

// Gate ORDER (which phase for which lifecycle facts + URL) is owned and
// table-tested by @mbe/auth's resolveAuthGate; here we only assert phase → screen.
vi.mock("@mbe/auth/react", async (importOriginal) => ({
  ...(await importOriginal<typeof AuthReact>()),
  useAuth: vi.fn(),
  useAuthGate: vi.fn(),
}));

vi.mock("./hooks/use-theme.js", () => ({
  useTheme: vi.fn(() => ({ theme: "system", resolvedTheme: "light", setTheme: vi.fn() })),
  useThemeServerHydration: vi.fn(),
  resolveTheme: vi.fn((t) => (t === "system" ? "light" : t)),
}));

vi.mock("./hooks/useUsers.js", () => ({
  useCurrentUser: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  GlobalNav: ({ labels }: { labels?: Record<string, string> }) => (
    <nav data-testid="global-nav" data-labels={JSON.stringify(labels)} />
  ),
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
    vi.mocked(useAuth).mockReturnValue(authState());
  });

  const renderAt = (gate: AuthGate) => {
    vi.mocked(useAuthGate).mockReturnValue(gate);
    return render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
  };

  it("renders the loading page for the loading phase", () => {
    renderAt({ phase: "loading" });
    expect(screen.getByTestId("loading-page")).toBeDefined();
  });

  it("renders the callback handshake for the callback phase", () => {
    renderAt({ phase: "callback" });
    expect(screen.getByTestId("callback-page")).toBeDefined();
    expect(screen.queryByTestId("loading-page")).toBeNull();
    expect(screen.queryByTestId("login-prompt")).toBeNull();
  });

  it("renders the sign-out handshake for the signing-out phase", () => {
    renderAt({ phase: "signing-out" });
    expect(screen.getByTestId("sign-out-page")).toBeDefined();
    expect(screen.queryByTestId("loading-page")).toBeNull();
  });

  it("renders the cold login gate when signed out", () => {
    renderAt({ phase: "signed-out", afterSignOut: false });
    expect(screen.getByTestId("login-prompt")).toBeDefined();
    expect(screen.getByText("Sign In")).toBeDefined();
    expect(screen.getByText("Hospitality")).toBeDefined();
  });

  it("renders the signed-out login gate after a sign-out round-trip", () => {
    renderAt({ phase: "signed-out", afterSignOut: true });
    expect(screen.getByTestId("login-prompt")).toBeDefined();
    expect(
      screen.getByText("You're signed out. Sign in again whenever you're ready.")
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeDefined();
  });

  it("renders the session-expired gate for the expired phase", () => {
    renderAt({ phase: "expired" });
    expect(screen.getByTestId("session-expired")).toBeDefined();
    expect(screen.queryByTestId("auth-layout")).toBeNull();
  });

  it("hands the global nav its link labels from the active locale's catalog", () => {
    renderAt({ phase: "ready" });
    expect(JSON.parse(screen.getByTestId("global-nav").dataset["labels"] ?? "{}")).toEqual({
      marketing: "Home",
      hospitality: "Hospitality",
      rialto: "Design System",
    });
  });

  it("renders Outlet in a flex column layout when ready", () => {
    const { container } = renderAt({ phase: "ready" });
    const wrapper = screen.getByTestId("auth-layout");
    expect(wrapper.className).toContain("authLayout");
    expect(container.querySelector("footer")).toBeNull();
  });

  describe("document title", () => {
    beforeEach(() => {
      // Mirrors index.html's static default, present before any effect runs.
      document.title = "Dashboard - Matt Butler Engineering";
    });

    it("titles the unauthenticated landing 'Hospitality', not 'Dashboard'", () => {
      renderAt({ phase: "signed-out", afterSignOut: false });
      expect(document.title).toBe("Hospitality - Matt Butler Engineering");
    });

    it("keeps the authenticated dashboard's 'Dashboard' title", () => {
      renderAt({ phase: "ready" });
      expect(document.title).toBe("Dashboard - Matt Butler Engineering");
    });
  });

  describe("failed exchange", () => {
    it("renders the failure page in place on a failed callback exchange (lane 1)", () => {
      const err = Object.assign(new Error("Auth Failed"), { source: "signinCallback" as const });
      renderAt({ phase: "error", error: err, onCallback: true });
      const failure = screen.getByTestId("auth-failure");
      expect(failure.getAttribute("data-lane")).toBe("1");
      expect(screen.getByText(describeAuthError(err).body)).toBeDefined();
      expect(screen.queryByTestId("callback-page")).toBeNull();
      expect(screen.queryByTestId("login-prompt")).toBeNull();
    });

    it("renders the failure page in place on a failed interactive sign-in (lane 0)", () => {
      const err = Object.assign(new Error("not permitted"), {
        error: "access_denied",
        source: "signinCallback" as const,
      });
      renderAt({ phase: "error", error: err, onCallback: false });
      expect(screen.getByTestId("auth-failure").getAttribute("data-lane")).toBe("0");
      expect(screen.getByText(describeAuthError(err).body)).toBeDefined();
    });
  });

  describe("skip-link landing target focus indicator (#5159)", () => {
    it("pairs .loginContainer's outline:none with a :focus-visible box-shadow replacement", () => {
      const css = readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), "App.module.css"),
        "utf-8"
      );
      const focusRule = css.match(/\.loginContainer:focus-visible\s*\{([^}]*)\}/)?.[1] ?? "";
      expect(focusRule).toMatch(/outline:\s*none/);
      expect(focusRule).toMatch(/box-shadow:\s*var\(--rialto-shadow-focus\)/);
    });
  });
});
