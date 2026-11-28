import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import { DashboardSidebar } from "./DashboardSidebar.js";
import type { NavSection } from "../nav-sections.js";
import { SubnavSlotContext } from "./availability/rail/subnav-slot.js";

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
          id: "availability",
          label: "Availability",
          action: { type: "route", path: "/availability" },
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

  describe("the Availability rail's slot (#9944)", () => {
    const withAvailability: NavSection[] = [
      {
        label: "Manage",
        items: [
          {
            id: "availability",
            label: "Availability",
            action: { type: "route", path: "/availability" },
          },
          { id: "menus", label: "Menus", action: { type: "route", path: "/menus" } },
        ],
      },
    ];

    const renderWithSlot = (sections: NavSection[]) => {
      const setSlot = vi.fn();
      render(
        <BrowserRouter>
          <SubnavSlotContext.Provider value={{ slot: null, setSlot, onPick: vi.fn() }}>
            <DashboardSidebar
              sections={sections}
              activePath="/availability"
              onAction={vi.fn()}
              isMobileOpen={false}
              onMobileClose={vi.fn()}
            />
          </SubnavSlotContext.Provider>
        </BrowserRouter>
      );
      return setSlot;
    };

    it("puts the slot inside the Availability item, so the tree nests under it", () => {
      const setSlot = renderWithSlot(withAvailability);
      const slot = setSlot.mock.calls.map(([el]) => el as HTMLElement | null).find(Boolean)!;
      expect(slot.closest("li")).toHaveTextContent(/^Availability$/);
    });

    it("puts it under the pre-launch Availability item, the one with the launch badge", () => {
      const setSlot = renderWithSlot(mockSections);
      const slot = setSlot.mock.calls.map(([el]) => el as HTMLElement | null).find(Boolean)!;
      expect(slot.closest("li")).toHaveTextContent(/^Availability 1 of 3$/);
      expect(screen.getByRole("button", { name: "Availability 1 of 3" })).toHaveAttribute(
        "aria-current",
        "true"
      );
    });

    it("no longer hosts it under the retired map's item id", () => {
      const setSlot = renderWithSlot([
        {
          label: "Get Started",
          items: [
            { id: "setup", label: "Setup", action: { type: "route", path: "/availability" } },
          ],
        },
      ]);
      expect(setSlot.mock.calls.some(([el]) => el)).toBe(false);
    });

    it("marks the Availability item as holding the current page, not as the page, so only the rail's node is the page", () => {
      renderWithSlot(withAvailability);
      expect(screen.getByRole("button", { name: "Availability" })).toHaveAttribute(
        "aria-current",
        "true"
      );
    });

    it("renders no slot when no item hosts it", () => {
      const setSlot = renderWithSlot([
        {
          label: "Main",
          items: [
            { id: "timeline", label: "Timeline", action: { type: "route", path: "/timeline" } },
          ],
        },
      ]);
      expect(setSlot.mock.calls.some(([el]) => el)).toBe(false);
    });
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
    const item = screen.getByRole("button", { name: "Availability 1 of 3" });
    expect(item.textContent).toContain("1 of 3");
  });

  it("renders an item without a badge as its label alone", () => {
    renderSidebar();
    expect(screen.getByRole("button", { name: "Timeline" })).toBeDefined();
  });

  it("marks only the most specific item current when one path holds another", () => {
    const sections: NavSection[] = [
      {
        label: "Manage",
        items: [
          {
            id: "availability",
            label: "Availability",
            action: { type: "route", path: "/availability" },
          },
          {
            id: "setup",
            label: "Availability map",
            action: { type: "route", path: "/availability/map" },
          },
        ],
      },
    ];
    renderSidebar({ sections, activePath: "/availability/map" });
    expect(screen.getByRole("button", { name: "Availability map" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("button", { name: "Availability" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("keeps a parent item current on its other children", () => {
    const sections: NavSection[] = [
      {
        label: "Manage",
        items: [
          {
            id: "availability",
            label: "Availability",
            action: { type: "route", path: "/availability" },
          },
          {
            id: "setup",
            label: "Availability map",
            action: { type: "route", path: "/availability/map" },
          },
        ],
      },
    ];
    renderSidebar({ sections, activePath: "/availability/hours" });
    expect(screen.getByRole("button", { name: "Availability" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("moves focus into the open mobile drawer, traps Tab, and restores focus to the trigger on close", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const { rerender, container } = renderSidebar({ isMobileOpen: false });
    const ui = (open: boolean) => (
      <BrowserRouter>
        <DashboardSidebar
          sections={mockSections}
          activePath="/dashboard"
          onAction={vi.fn()}
          isMobileOpen={open}
          onMobileClose={vi.fn()}
        />
      </BrowserRouter>
    );
    rerender(ui(true));
    const nav = container.querySelector("nav") as HTMLElement;
    expect(nav.contains(document.activeElement)).toBe(true);

    const focusable = Array.from(nav.querySelectorAll<HTMLElement>("button"));
    const last = focusable[focusable.length - 1] as HTMLElement;
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(focusable[0]);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    rerender(ui(false));
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
