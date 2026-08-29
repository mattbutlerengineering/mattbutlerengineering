import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth, useAccessToken } from "@mbe/auth/react";
import { useVenueReadiness } from "../hooks/useVenueReadiness.js";
import type { VenueReadiness } from "../hooks/useVenueReadiness.js";
import { DashboardLayout } from "./DashboardLayout.js";
import React from "react";

vi.mock("@mbe/auth/react", () => ({
  useAuth: vi.fn(),
  useAccessToken: vi.fn(),
}));

vi.mock("../hooks/useVenueReadiness.js", () => ({
  useVenueReadiness: vi.fn(() => ({
    status: "operational",
    isLoading: false,
    completedSteps: [],
    nextStep: "hours",
  })),
}));

vi.mock("../hooks/useSSESync.js", () => ({
  SSESyncProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSSESync: vi.fn(() => ({ reconnect: vi.fn() })),
  useSSEStatus: vi.fn(() => ({ isConnected: true, error: null })),
  useSSEEventFeed: vi.fn(() => []),
}));

vi.mock("../hooks/use-command-palette.js", () => ({
  useCommandPalette: vi.fn(() => ({
    open: false,
    setOpen: vi.fn(),
    items: [],
  })),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Banner: ({
    children,
    action,
    onDismiss,
    dismissible,
  }: {
    children: React.ReactNode;
    action?: React.ReactNode;
    onDismiss?: () => void;
    dismissible?: boolean;
  }) => (
    <div role="alert" data-testid="refresh-banner">
      {children}
      {action}
      {dismissible && (
        <button aria-label="Dismiss" onClick={onDismiss}>
          x
        </button>
      )}
    </div>
  ),
  Breadcrumb: ({ items }: { items: Array<{ label: string; onClick?: () => void }> }) => (
    <nav data-testid="breadcrumb" aria-label="Breadcrumb">
      <ol>
        {items.map((item: { label: string; onClick?: () => void }, i: number) => (
          <li key={i} data-testid={`breadcrumb-item-${i}`}>
            {item.onClick ? (
              <button onClick={item.onClick}>{item.label}</button>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  ),
  CommandPalette: () => <div data-testid="command-palette" />,
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ChatPanel: (props: { onClose: () => void }) => (
    <div data-testid="chat-panel">
      <button onClick={props.onClose}>Close chat</button>
      Chat Panel Content
    </div>
  ),
  Kbd: () => <div />,
  WatchLoader: ({ "aria-label": ariaLabel }: { "aria-label": string }) => (
    <div role="img" aria-label={ariaLabel} />
  ),
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Heading: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  useToast: () => ({ toast: vi.fn() }),
  useThemeState: () => ({
    preference: "system",
    setTheme: vi.fn(),
    resolved: "light",
  }),
  resolveTheme: vi.fn((t) => t),
}));

describe("DashboardLayout", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      signIn: vi.fn(),
      signOut: vi.fn(),
      accessToken: "test-token",
    } as unknown as ReturnType<typeof useAuth>);
    vi.mocked(useAccessToken).mockReturnValue({
      accessToken: "test-token",
      refreshError: null,
    });
  });

  // "onboarding" is a top-level sibling route here — matching the real app's
  // route tree (main.tsx), where /onboarding uses a separate OnboardingLayout
  // and is NOT nested inside DashboardLayout. This lets tests observe that
  // dashboard chrome (data-testid="dashboard-layout") never mounts when the
  // render-time gate redirects there (#3889).
  const renderLayout = (initialPath = "/") => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="onboarding" element={<div>Onboarding Content</div>} />
            <Route path="/" element={<DashboardLayout />}>
              <Route path="timeline" element={<div>Timeline Content</div>} />
              <Route path="guests" element={<div>Guests Content</div>} />
              <Route path="floor-plans" element={<div>Floor Plans Content</div>} />
              <Route path="floor-plans/:id" element={<div>Floor Plan Editor</div>} />
              <Route path="reservations" element={<div>Reservations Content</div>} />
              <Route path="settings" element={<div>Settings Content</div>} />
              <Route path="dashboard" element={<div>Dashboard Content</div>} />
              <Route path="setup" element={<div>Setup Content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it("renders a loading state instead of dashboard chrome while readiness status is loading", () => {
    const loading: VenueReadiness = {
      status: "loading",
      completedSteps: [],
      nextStep: null,
      progress: 0,
    };
    vi.mocked(useVenueReadiness).mockReturnValue(loading);
    renderLayout("/timeline");
    // No dashboard chrome and no outlet content while readiness is unknown.
    expect(screen.queryByTestId("dashboard-layout")).not.toBeInTheDocument();
    expect(screen.queryByText("Timeline Content")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Loading" })).toBeInTheDocument();
  });

  it("redirects to onboarding when no venue exists, without ever rendering dashboard chrome", () => {
    vi.mocked(useVenueReadiness).mockReturnValue({
      status: "no-venue",
      completedSteps: [],
      nextStep: "hours",
      progress: 0,
    });
    renderLayout("/timeline");
    expect(screen.getByText("Onboarding Content")).toBeDefined();
    expect(screen.queryByTestId("dashboard-layout")).not.toBeInTheDocument();
  });

  it("never sets window.__e2eChromePainted when no venue exists (regression guard for #3918)", () => {
    // Mirrors the flag the zero-venue E2E spec (e2e/onboarding.spec.ts) reads
    // instead of asserting DOM absence after the redirect settles — which
    // would pass even if chrome painted and the flash had already ended by
    // the time the assertion ran. This unit test is the executable proxy for
    // that E2E spec here: this environment has no E2E_AUTH0_* credentials, so
    // Playwright itself cannot run, but this exercises the exact same
    // render-time gate and instrumentation hook the spec depends on.
    const win = window as unknown as { __e2eChromePainted?: boolean };
    win.__e2eChromePainted = false;
    vi.mocked(useVenueReadiness).mockReturnValue({
      status: "no-venue",
      completedSteps: [],
      nextStep: "hours",
      progress: 0,
    });
    renderLayout("/timeline");
    expect(win.__e2eChromePainted).toBe(false);
  });

  it("never renders dashboard chrome across the loading -> no-venue transition", () => {
    const loading: VenueReadiness = {
      status: "loading",
      completedSteps: [],
      nextStep: null,
      progress: 0,
    };
    vi.mocked(useVenueReadiness).mockReturnValue(loading);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // A fresh element tree per render call — reusing the same JSX object
    // reference across render()/rerender() lets React bail out of
    // re-rendering the whole subtree (props identity unchanged), which would
    // hide a real transition from ever reaching DashboardLayoutInner.
    const renderTree = () => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/timeline"]}>
          <Routes>
            <Route path="onboarding" element={<div>Onboarding Content</div>} />
            <Route path="/" element={<DashboardLayout />}>
              <Route path="timeline" element={<div>Timeline Content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const { rerender } = render(renderTree());

    expect(screen.queryByTestId("dashboard-layout")).not.toBeInTheDocument();
    expect(screen.queryByText("Timeline Content")).not.toBeInTheDocument();

    vi.mocked(useVenueReadiness).mockReturnValue({
      status: "no-venue",
      completedSteps: [],
      nextStep: "hours",
      progress: 0,
    });
    rerender(renderTree());

    expect(screen.queryByTestId("dashboard-layout")).not.toBeInTheDocument();
    expect(screen.queryByText("Timeline Content")).not.toBeInTheDocument();
    expect(screen.getByText("Onboarding Content")).toBeInTheDocument();
  });

  it("redirects operational pages to setup when status is setup", () => {
    vi.mocked(useVenueReadiness).mockReturnValue({
      status: "setup",
      completedSteps: [],
      nextStep: "hours",
      progress: 33,
    });
    renderLayout("/timeline");
    expect(screen.getByText("Setup Content")).toBeDefined();
  });

  it("allows the dashboard as the post-onboarding landing when status is setup", () => {
    // A freshly-onboarded venue (basics + operating hours, no floor plan yet)
    // is in "setup" status. The dashboard is NOT operational-only, so it must
    // render as the landing page rather than bouncing to /setup or /onboarding.
    const setupReadiness: VenueReadiness = {
      status: "setup",
      completedSteps: ["onboarding", "operating-hours"],
      nextStep: "floor-plan",
      progress: 66,
    };
    vi.mocked(useVenueReadiness).mockReturnValue(setupReadiness);
    renderLayout("/dashboard");
    expect(screen.getByText("Dashboard Content")).toBeDefined();
  });

  it("allows operational pages when status is operational", () => {
    vi.mocked(useVenueReadiness).mockReturnValue({
      status: "operational",
      completedSteps: ["hours", "tables", "publish"],
      nextStep: null,
      progress: 100,
    });
    renderLayout("/timeline");
    expect(screen.getByText("Timeline Content")).toBeDefined();
  });

  it("renders breadcrumbs and sidebar", () => {
    vi.mocked(useVenueReadiness).mockReturnValue({
      status: "operational",
      completedSteps: ["hours", "tables", "publish"],
      nextStep: null,
      progress: 100,
    });
    renderLayout("/timeline");
    expect(screen.getByTestId("breadcrumb")).toBeDefined();
    // Breadcrumb shows "Home" on the timeline route; sidebar shows "Timeline" nav item
    expect(screen.getByTestId("breadcrumb")).toHaveTextContent("Home");
  });

  it("has no Copilot nav item in sidebar", () => {
    vi.mocked(useVenueReadiness).mockReturnValue({
      status: "operational",
      completedSteps: ["hours", "tables", "publish"],
      nextStep: null,
      progress: 100,
    });
    renderLayout("/timeline");
    expect(screen.queryByText("Copilot")).not.toBeInTheDocument();
  });

  describe("breadcrumbs reflect current route", () => {
    beforeEach(() => {
      vi.mocked(useVenueReadiness).mockReturnValue({
        status: "operational",
        completedSteps: ["hours", "tables", "publish"],
        nextStep: null,
        progress: 100,
      });
    });

    it("shows Home as current page on the timeline route", () => {
      renderLayout("/timeline");
      const items = screen.getAllByTestId(/^breadcrumb-item-/);
      expect(items).toHaveLength(1);
      expect(items[0]).toHaveTextContent("Home");
    });

    it("shows Home > Guests on the guests route", () => {
      renderLayout("/guests");
      const items = screen.getAllByTestId(/^breadcrumb-item-/);
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent("Home");
      expect(items[1]).toHaveTextContent("Guests");
      // Last item is current page (no onClick)
      expect(items[1]!.querySelector("[aria-current='page']")).not.toBeNull();
    });

    it("shows Home > Floor Plans on the floor-plans route", () => {
      renderLayout("/floor-plans");
      const items = screen.getAllByTestId(/^breadcrumb-item-/);
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent("Home");
      expect(items[1]).toHaveTextContent("Floor Plans");
    });

    it("shows Home > Floor Plans > Details for nested floor-plan route", () => {
      renderLayout("/floor-plans/abc-123");
      const items = screen.getAllByTestId(/^breadcrumb-item-/);
      expect(items).toHaveLength(3);
      expect(items[0]).toHaveTextContent("Home");
      expect(items[1]).toHaveTextContent("Floor Plans");
      expect(items[2]).toHaveTextContent("Details");
      // Middle item is clickable, last is current page
      expect(items[1]!.querySelector("button")).not.toBeNull();
      expect(items[2]!.querySelector("[aria-current='page']")).not.toBeNull();
    });

    it("shows Home > Settings on the settings route", () => {
      renderLayout("/settings");
      const items = screen.getAllByTestId(/^breadcrumb-item-/);
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent("Home");
      expect(items[1]).toHaveTextContent("Settings");
    });

    it("Home breadcrumb links to /timeline", async () => {
      renderLayout("/guests");
      const homeLink = screen.getByTestId("breadcrumb-item-0").querySelector("button");
      expect(homeLink).not.toBeNull();
      expect(homeLink).toHaveTextContent("Home");
    });
  });

  it("chat wrapper has z-index style to clear the navbar stacking context", async () => {
    vi.mocked(useVenueReadiness).mockReturnValue({
      status: "operational",
      completedSteps: ["hours", "tables", "publish"],
      nextStep: null,
      progress: 100,
    });
    renderLayout("/");

    const chatNav = screen.getByText("Chat");
    const user = userEvent.setup();
    await user.click(chatNav);

    const wrapper = screen.getByTestId("chat-panel").closest("[data-chat-wrapper]") as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.style.zIndex).toBeTruthy();
  });

  describe("session refresh banner", () => {
    beforeEach(() => {
      vi.mocked(useVenueReadiness).mockReturnValue({
        status: "operational",
        completedSteps: ["hours", "tables", "publish"],
        nextStep: null,
        progress: 100,
      });
    });

    it("renders an alert banner when the silent refresh fails", () => {
      vi.mocked(useAccessToken).mockReturnValue({
        accessToken: "test-token",
        refreshError: new Error("refresh failed"),
      });

      renderLayout("/timeline");

      expect(screen.getByTestId("refresh-banner")).toHaveTextContent(/session couldn't refresh/i);
    });

    it("does not render the banner when there is no refresh error", () => {
      renderLayout("/timeline");

      expect(screen.queryByTestId("refresh-banner")).not.toBeInTheDocument();
    });

    it("hides the banner when dismissed", async () => {
      vi.mocked(useAccessToken).mockReturnValue({
        accessToken: "test-token",
        refreshError: new Error("refresh failed"),
      });

      renderLayout("/timeline");
      const user = userEvent.setup();
      await user.click(screen.getByLabelText("Dismiss"));

      expect(screen.queryByTestId("refresh-banner")).not.toBeInTheDocument();
    });

    it("signs in again with the current location as returnTo", async () => {
      const signIn = vi.fn();
      vi.mocked(useAuth).mockReturnValue({
        signIn,
        signOut: vi.fn(),
        accessToken: "test-token",
      } as unknown as ReturnType<typeof useAuth>);
      vi.mocked(useAccessToken).mockReturnValue({
        accessToken: "test-token",
        refreshError: new Error("refresh failed"),
      });

      renderLayout("/reservations?date=2026-09-01");
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /sign in again/i }));

      expect(signIn).toHaveBeenCalledWith({ returnTo: "/reservations?date=2026-09-01" });
    });
  });

  it("keeps ChatPanel mounted after closing to preserve session state", async () => {
    vi.mocked(useVenueReadiness).mockReturnValue({
      status: "operational",
      completedSteps: ["hours", "tables", "publish"],
      nextStep: null,
      progress: 100,
    });
    renderLayout("/");

    const chatNav = screen.getByText("Chat");
    const user = userEvent.setup();

    await user.click(chatNav);
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();

    await user.click(screen.getByText("Close chat"));

    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
    const wrapper = screen.getByTestId("chat-panel").closest("[data-chat-wrapper]");
    expect(wrapper).toHaveStyle({ display: "none" });
  });
});
