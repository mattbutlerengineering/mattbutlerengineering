import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useThemeServerHydration } from "./hooks/use-theme.js";
import { useCurrentUser } from "./hooks/useUsers.js";
import { MemoryRouter } from "react-router";
import { useAuth, useAuthGate } from "@mbe/auth/react";
import type { AuthGate } from "@mbe/auth/react";
import { describeAuthError } from "./lib/describe-auth-error.js";
import { App } from "./App.js";
import { currentHostConfig } from "./lib/host-brand.js";
import type * as HostBrand from "./lib/host-brand.js";
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

// The real landing is a long animated page with its own tests; here it is a
// stub that can report a sky, so the shell's routing and nav wiring are what
// these tests exercise.
vi.mock("./components/showcase/ShowcaseLanding.js", () => ({
  ShowcaseLanding: ({ onSkyChange }: { onSkyChange?: (sky: "light" | "dark" | null) => void }) => (
    <div data-testid="showcase-landing">
      <button onClick={() => onSkyChange?.("dark")}>night falls</button>
    </div>
  ),
}));

vi.mock("./lib/host-brand.js", async (importOriginal) => {
  const actual = await importOriginal<typeof HostBrand>();
  return { ...actual, currentHostConfig: vi.fn(actual.currentHostConfig) };
});

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
  // The standalone host's brand bar renders a ThemeToggle where GlobalNav has its own.
  ThemeToggle: () => <div data-testid="theme-toggle" />,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  GlobalNav: ({ labels }: { labels?: Record<string, string> }) => (
    <nav data-testid="global-nav" data-labels={JSON.stringify(labels)} />
  ),
  Footer: ({
    children,
    variant,
    columns,
    copyright,
  }: {
    children?: React.ReactNode;
    variant?: string;
    columns?: { title: string }[];
    copyright?: string;
  }) => (
    <footer data-variant={variant}>
      {columns?.map((c) => (
        <nav key={c.title} aria-label={c.title} />
      ))}
      {copyright}
      {children}
    </footer>
  ),
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

  /** A staff deep link: signed out there, a visitor gets the plain gate, not the landing. */
  const DEEP_LINK = "/reservations";

  const renderAt = (gate: AuthGate, path = "/") => {
    vi.mocked(useAuthGate).mockReturnValue(gate);
    return render(
      <MemoryRouter initialEntries={[path]}>
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

  it("renders the cold login gate when signed out on a deep link", () => {
    renderAt({ phase: "signed-out", afterSignOut: false }, DEEP_LINK);
    expect(screen.getByTestId("login-prompt")).toBeDefined();
    expect(screen.getByText("Sign In")).toBeDefined();
    expect(screen.getByText("Hospitality")).toBeDefined();
    expect(screen.queryByTestId("showcase-landing")).toBeNull();
  });

  it("shows the showcase landing to a signed-out visitor at the app root", async () => {
    renderAt({ phase: "signed-out", afterSignOut: false });
    expect(await screen.findByTestId("showcase-landing")).toBeDefined();
    expect(screen.queryByTestId("login-prompt")).toBeNull();
  });

  const robotsContent = () =>
    document.head.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null;

  it("leaves the showcase landing indexable", async () => {
    renderAt({ phase: "signed-out", afterSignOut: false });
    await screen.findByTestId("showcase-landing");
    expect(robotsContent()).toBe("index, follow");
  });

  it("marks the sign-in gate on a deep link noindex, nofollow", () => {
    renderAt({ phase: "signed-out", afterSignOut: false }, DEEP_LINK);
    expect(robotsContent()).toBe("noindex, nofollow");
  });

  it("marks the signed-in dashboard noindex, nofollow at the root and on a deep link", () => {
    const { unmount } = renderAt({ phase: "ready" });
    expect(robotsContent()).toBe("noindex, nofollow");
    unmount();
    renderAt({ phase: "ready" }, DEEP_LINK);
    expect(robotsContent()).toBe("noindex, nofollow");
  });

  it("keeps the plain gate at the root after a sign-out round-trip", () => {
    renderAt({ phase: "signed-out", afterSignOut: true });
    expect(screen.getByTestId("login-prompt")).toBeDefined();
    expect(screen.queryByTestId("showcase-landing")).toBeNull();
  });

  it("keeps the plain gate at the root on a standalone host, where the product is the brand", async () => {
    const { currentHostConfig: actual } =
      await vi.importActual<typeof HostBrand>("./lib/host-brand.js");
    vi.mocked(currentHostConfig).mockImplementation(() => ({ ...actual(), standalone: true }));
    try {
      renderAt({ phase: "signed-out", afterSignOut: false });
      expect(screen.getByTestId("login-prompt")).toBeDefined();
      expect(screen.queryByTestId("showcase-landing")).toBeNull();
    } finally {
      vi.mocked(currentHostConfig).mockImplementation(actual);
    }
  });

  it("lets the document scroll on the landing only (index.css keys off [data-guest-surface])", async () => {
    const { container, unmount } = renderAt({ phase: "signed-out", afterSignOut: false });
    await screen.findByTestId("showcase-landing");
    expect(container.querySelector("[data-guest-surface]")).not.toBeNull();
    unmount();

    const gate = renderAt({ phase: "signed-out", afterSignOut: true });
    expect(gate.container.querySelector("[data-guest-surface]")).toBeNull();
  });

  it("gives the nav the landing's sky, and none on any other screen", async () => {
    const { container } = renderAt({ phase: "signed-out", afterSignOut: false });
    const navSky = container.querySelector("[data-nav-sky]");
    expect(navSky).toContainElement(screen.getByTestId("global-nav"));
    expect(navSky).not.toHaveAttribute("data-theme");

    await screen.findByTestId("showcase-landing");
    fireEvent.click(screen.getByRole("button", { name: "night falls" }));
    expect(navSky).toHaveAttribute("data-theme", "dark");
  });

  it("renders the signed-out login gate after a sign-out round-trip", () => {
    renderAt({ phase: "signed-out", afterSignOut: true });
    expect(screen.getByTestId("login-prompt")).toBeDefined();
    expect(
      screen.getByText("You're signed out. Sign in again whenever you're ready.")
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeDefined();
  });

  it("gives the signed-out shell the site's rich footer with project links (#9151)", () => {
    renderAt({ phase: "signed-out", afterSignOut: false });
    const footer = screen.getByRole("contentinfo");
    expect(footer.getAttribute("data-variant")).toBe("rich");
    expect(screen.getByRole("navigation", { name: "Projects" })).toBeDefined();
    expect(footer.textContent).toContain(`${new Date().getFullYear()} Matt Butler Engineering`);
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
      gen: "Gen Playground",
    });
  });

  it("renders Outlet in a flex column layout when ready", () => {
    const { container } = renderAt({ phase: "ready" });
    const wrapper = screen.getByTestId("auth-layout");
    expect(wrapper.className).toContain("authLayout");
    expect(container.querySelector("footer")).toBeNull();
  });

  it("hydrates the theme from the saved preference once signed in (lazy ThemeServerSync, #9976)", async () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      data: { preferences: { theme: "dark" } } as NonNullable<
        ReturnType<typeof useCurrentUser>["data"]
      >,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderAt({ phase: "ready" });
    await waitFor(() => expect(useThemeServerHydration).toHaveBeenCalledWith("dark"));
  });

  describe("document title", () => {
    beforeEach(() => {
      // Mirrors index.html's static default, present before any effect runs.
      document.title = "Dashboard - Matt Butler Engineering";
    });

    it("titles the unauthenticated gate 'Hospitality', not 'Dashboard'", () => {
      renderAt({ phase: "signed-out", afterSignOut: false }, DEEP_LINK);
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

  describe("authenticated layout contains its absolutely positioned descendants", () => {
    // A visually hidden `position: absolute` status line with no positioned
    // ancestor resolves against the initial containing block, so the shell's
    // `overflow: hidden` never clips it: it kept its in-flow position deep in
    // the scrolled content and stretched the document past the viewport
    // (blank band under Availability in the hospitality visual baselines, #8532).
    it("positions .authLayout so its overflow: hidden clips them", () => {
      const css = readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), "App.module.css"),
        "utf-8"
      );
      const layoutRule = css.match(/\.authLayout\s*\{([^}]*)\}/)?.[1] ?? "";
      expect(layoutRule).toMatch(/overflow:\s*hidden/);
      expect(layoutRule).toMatch(/position:\s*relative/);
    });
  });
});
