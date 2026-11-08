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
      label: "Get Started",
      items: [
        {
          id: "setup",
          label: "Venue Setup",
          action: { type: "route", path: "/setup" },
          badge: "1 of 3",
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
    expect(screen.getByText("Get Started")).toBeDefined();
  });

  it("toggles section collapse", () => {
    renderSidebar();
    const mainButton = screen.getByText("Main").closest("button");
    expect(mainButton).toBeDefined();

    // Toggle collapse
    if (mainButton) fireEvent.click(mainButton);

    expect(mainButton?.getAttribute("aria-expanded")).toBe("false");
  });

  it("renders the progress count inside the item's accessible name", () => {
    renderSidebar();
    const item = screen.getByRole("button", { name: "Venue Setup 1 of 3" });
    expect(item.textContent).toContain("1 of 3");
  });

  it("renders an item without a badge as its label alone", () => {
    renderSidebar();
    expect(screen.getByRole("button", { name: "Timeline" })).toBeDefined();
  });
});
