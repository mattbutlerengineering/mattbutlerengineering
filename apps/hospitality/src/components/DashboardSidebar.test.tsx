import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import { DashboardSidebar } from "./DashboardSidebar.js";
import type { NavSection } from "../nav-sections.js";

describe("DashboardSidebar", () => {
  const mockSections: NavSection[] = [
    {
      label: "Main",
      items: [
        { id: "dashboard", label: "Dashboard", action: { type: "route", path: "/dashboard" } },
        { id: "timeline", label: "Timeline", action: { type: "route", path: "/timeline" } },
      ],
    },
    {
      label: "Setup",
      items: [
        {
          id: "hours",
          label: "Hours",
          action: { type: "route", path: "/hours" },
          stepStatus: "completed",
        },
        {
          id: "tables",
          label: "Tables",
          action: { type: "route", path: "/tables" },
          stepStatus: "current",
        },
        {
          id: "publish",
          label: "Publish",
          action: { type: "route", path: "/publish" },
          stepStatus: "locked",
        },
      ],
    },
  ];

  beforeEach(() => {
    localStorage.clear();
  });

  const renderSidebar = (props = {}) => {
    return render(
      <BrowserRouter>
        <DashboardSidebar
          sections={mockSections}
          activePath="/dashboard"
          onAction={vi.fn()}
          isMobileOpen={false}
          onMobileClose={vi.fn()}
          {...props}
        />
      </BrowserRouter>
    );
  };

  it("renders footerSlot after the nav sections", () => {
    renderSidebar({ footerSlot: <div data-testid="footer-slot">footer</div> });
    const footer = screen.getByTestId("footer-slot");
    const lastNavItem = screen.getByText("Timeline");
    expect(
      lastNavItem.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("renders navigation labels", () => {
    renderSidebar();
    expect(screen.getByText("Dashboard")).toBeDefined();
    expect(screen.getByText("Timeline")).toBeDefined();
  });

  it("renders section labels", () => {
    renderSidebar();
    expect(screen.getByText("Main")).toBeDefined();
    expect(screen.getByText("Setup")).toBeDefined();
  });

  it("toggles section collapse", () => {
    renderSidebar();
    const mainButton = screen.getByText("Main").closest("button");
    expect(mainButton).toBeDefined();

    // Toggle collapse
    if (mainButton) fireEvent.click(mainButton);

    expect(mainButton?.getAttribute("aria-expanded")).toBe("false");
  });

  it("renders step statuses correctly", () => {
    renderSidebar();
    expect(screen.getByText("Hours")).toBeDefined();
    expect(screen.getByText("Tables")).toBeDefined();
    expect(screen.getByText("Publish")).toBeDefined();
  });
});
