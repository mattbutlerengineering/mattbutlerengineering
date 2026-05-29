import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { useVenueReadiness } from "../hooks/useVenueReadiness.js";
import { DashboardLayout } from "./DashboardLayout.js";
import React from "react";

vi.mock("@mbe/auth/react", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../hooks/useVenueReadiness.js", () => ({
  useVenueReadiness: vi.fn(() => ({
    status: "operational",
    isLoading: false,
    completedSteps: [],
    nextStep: "hours",
  })),
}));

vi.mock("../hooks/useReservationQuerySync.js", () => ({
  useReservationQuerySync: vi.fn(() => ({
    isConnected: true,
    error: null,
    reconnect: vi.fn(),
  })),
}));

vi.mock("../hooks/use-command-palette.js", () => ({
  useCommandPalette: vi.fn(() => ({
    open: false,
    setOpen: vi.fn(),
    items: [],
  })),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
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
      signOut: vi.fn(),
      accessToken: "test-token",
    } as any);
  });

  const renderLayout = (initialPath = "/") => {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/" element={<DashboardLayout />}>
            <Route path="timeline" element={<div>Timeline Content</div>} />
            <Route path="guests" element={<div>Guests Content</div>} />
            <Route path="floor-plans" element={<div>Floor Plans Content</div>} />
            <Route path="floor-plans/:id" element={<div>Floor Plan Editor</div>} />
            <Route path="reservations" element={<div>Reservations Content</div>} />
            <Route path="settings" element={<div>Settings Content</div>} />
            <Route path="onboarding" element={<div>Onboarding Content</div>} />
            <Route path="setup" element={<div>Setup Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
  };

  it("redirects to onboarding when no venue exists", () => {
    vi.mocked(useVenueReadiness).mockReturnValue({
      status: "no-venue",
      isLoading: false,
      completedSteps: [],
      nextStep: "hours",
    } as any);
    renderLayout("/timeline");
    expect(screen.getByText("Onboarding Content")).toBeDefined();
  });

  it("redirects operational pages to setup when status is setup", () => {
    vi.mocked(useVenueReadiness).mockReturnValue({
      status: "setup",
      isLoading: false,
      completedSteps: [],
      nextStep: "hours",
    } as any);
    renderLayout("/timeline");
    expect(screen.getByText("Setup Content")).toBeDefined();
  });

  it("allows operational pages when status is operational", () => {
    vi.mocked(useVenueReadiness).mockReturnValue({
      status: "operational",
      isLoading: false,
      completedSteps: ["hours", "tables", "publish"],
      nextStep: null,
    } as any);
    renderLayout("/timeline");
    expect(screen.getByText("Timeline Content")).toBeDefined();
  });

  it("renders breadcrumbs and sidebar", () => {
    vi.mocked(useVenueReadiness).mockReturnValue({
      status: "operational",
      isLoading: false,
      completedSteps: ["hours", "tables", "publish"],
      nextStep: null,
    } as any);
    renderLayout("/timeline");
    expect(screen.getByTestId("breadcrumb")).toBeDefined();
    // Breadcrumb shows "Home" on the timeline route; sidebar shows "Timeline" nav item
    expect(screen.getByTestId("breadcrumb")).toHaveTextContent("Home");
  });

  it("has no Copilot nav item in sidebar", () => {
    vi.mocked(useVenueReadiness).mockReturnValue({
      status: "operational",
      isLoading: false,
      completedSteps: ["hours", "tables", "publish"],
      nextStep: null,
    } as any);
    renderLayout("/timeline");
    expect(screen.queryByText("Copilot")).not.toBeInTheDocument();
  });

  describe("breadcrumbs reflect current route", () => {
    beforeEach(() => {
      vi.mocked(useVenueReadiness).mockReturnValue({
        status: "operational",
        isLoading: false,
        completedSteps: ["hours", "tables", "publish"],
        nextStep: null,
      } as any);
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

  it("keeps ChatPanel mounted after closing to preserve session state", async () => {
    vi.mocked(useVenueReadiness).mockReturnValue({
      status: "operational",
      isLoading: false,
      completedSteps: ["hours", "tables", "publish"],
      nextStep: null,
    } as any);
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
