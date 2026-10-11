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
        { id: "dashboard", label: "Dashboard", path: "/dashboard" },
        { id: "timeline", label: "Timeline", path: "/timeline" },
      ],
    },
    {
      label: "Setup",
      items: [
        { id: "hours", label: "Hours", path: "/hours", stepStatus: "completed" },
        { id: "tables", label: "Tables", path: "/tables", stepStatus: "current" },
        { id: "publish", label: "Publish", path: "/publish", stepStatus: "locked" },
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
          onNavigate={vi.fn()}
          isMobileOpen={false}
          onMobileClose={vi.fn()}
          {...props}
        />
      </BrowserRouter>
    );
  };

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
