import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

vi.mock("../hooks/use-command-palette.js", () => ({
  useCommandPalette: vi.fn(() => ({
    open: false,
    setOpen: vi.fn(),
    items: [],
  })),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Breadcrumb: () => <div data-testid="breadcrumb" />,
  CommandPalette: () => <div data-testid="command-palette" />,
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  GenCopilot: () => <div data-testid="copilot" />,
  Kbd: () => <div />,
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Heading: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  useToast: () => ({ toast: vi.fn() }),
  useThemeState: () => ({ preference: "system", setTheme: vi.fn(), resolved: "light" }),
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
      nextStep: "hours" 
    } as any);
    renderLayout("/timeline");
    expect(screen.getByText("Onboarding Content")).toBeDefined();
  });

  it("redirects operational pages to setup when status is setup", () => {
    vi.mocked(useVenueReadiness).mockReturnValue({ 
      status: "setup", 
      isLoading: false, 
      completedSteps: [], 
      nextStep: "hours" 
    } as any);
    renderLayout("/timeline");
    expect(screen.getByText("Setup Content")).toBeDefined();
  });

  it("allows operational pages when status is operational", () => {
    vi.mocked(useVenueReadiness).mockReturnValue({ 
      status: "operational", 
      isLoading: false, 
      completedSteps: ["hours", "tables", "publish"], 
      nextStep: null 
    } as any);
    renderLayout("/timeline");
    expect(screen.getByText("Timeline Content")).toBeDefined();
  });

  it("renders breadcrumbs and sidebar", () => {
    vi.mocked(useVenueReadiness).mockReturnValue({ 
      status: "operational", 
      isLoading: false, 
      completedSteps: ["hours", "tables", "publish"], 
      nextStep: null 
    } as any);
    renderLayout("/timeline");
    expect(screen.getByTestId("breadcrumb")).toBeDefined();
    // DashboardSidebar is rendered but we mocked its internals or it's rendering labels
    expect(screen.getByText("Timeline")).toBeDefined();
  });
});
