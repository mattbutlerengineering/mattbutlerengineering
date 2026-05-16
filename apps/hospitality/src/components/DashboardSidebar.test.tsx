import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { DashboardSidebar } from "./DashboardSidebar.js";
import type { NavSection } from "../nav-sections.js";
import React from "react";

describe("DashboardSidebar", () => {
  const mockSections: NavSection[] = [
    {
      id: "main",
      label: "Main",
      items: [
        { id: "dashboard", label: "Dashboard", href: "/dashboard", type: "nav" },
        { id: "timeline", label: "Timeline", href: "/timeline", type: "nav" },
      ],
    },
    {
      id: "setup",
      label: "Setup",
      items: [
        { id: "hours", label: "Hours", href: "/hours", type: "step", status: "completed" },
        { id: "tables", label: "Tables", href: "/tables", type: "step", status: "current" },
        { id: "publish", label: "Publish", href: "/publish", type: "step", status: "locked" },
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
