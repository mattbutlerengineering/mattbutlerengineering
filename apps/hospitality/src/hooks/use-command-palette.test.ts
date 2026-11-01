import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCommandPalette } from "./use-command-palette.js";
import type { NavSection } from "../nav-sections.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  useThemeState: vi.fn(() => ({ preference: "system", setTheme: vi.fn(), resolved: "light" })),
  resolveTheme: vi.fn((t: string) => t),
}));

describe("useCommandPalette", () => {
  const mockSections: NavSection[] = [
    {
      label: "Main",
      items: [
        { id: "dashboard", label: "Dashboard", action: { type: "route", path: "/dashboard" } },
        { id: "timeline", label: "Timeline", action: { type: "route", path: "/timeline" } },
      ],
    },
    {
      label: "Settings",
      items: [{ id: "profile", label: "Profile", action: { type: "route", path: "/profile" } }],
    },
  ];

  const mockRunAction = vi.fn();
  const mockToggleTheme = vi.fn();

  const defaultOptions = {
    sections: mockSections,
    runAction: mockRunAction,
    toggleTheme: mockToggleTheme,
  };

  it("returns open as false initially", () => {
    const { result } = renderHook(() => useCommandPalette(defaultOptions));
    expect(result.current.open).toBe(false);
  });

  it("closes when the viewport changes form, since the page beneath may mount a focus-taking surface (#8029)", () => {
    const listeners: (() => void)[] = [];
    let tablet = false;
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: tablet && query === "(max-width: 1024px)",
      addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    const { result } = renderHook(() => useCommandPalette(defaultOptions));
    act(() => result.current.setOpen(true));
    expect(result.current.open).toBe(true);

    tablet = true;
    act(() => listeners.forEach((listener) => listener()));

    expect(result.current.open).toBe(false);
    window.matchMedia = original;
  });

  it("setOpen toggles the open state", () => {
    const { result } = renderHook(() => useCommandPalette(defaultOptions));

    act(() => {
      result.current.setOpen(true);
    });
    expect(result.current.open).toBe(true);

    act(() => {
      result.current.setOpen(false);
    });
    expect(result.current.open).toBe(false);
  });

  it("builds navigation items from sections", () => {
    const { result } = renderHook(() => useCommandPalette(defaultOptions));

    const navItems = result.current.items.filter((item) => item.group !== "Actions");
    expect(navItems).toHaveLength(3);
    expect(navItems[0]).toMatchObject({ id: "dashboard", label: "Dashboard", group: "Main" });
    expect(navItems[1]).toMatchObject({ id: "timeline", label: "Timeline", group: "Main" });
    expect(navItems[2]).toMatchObject({ id: "profile", label: "Profile", group: "Settings" });
  });

  it("builds action items with correct labels", () => {
    const { result } = renderHook(() => useCommandPalette(defaultOptions));

    const actionItems = result.current.items.filter((item) => item.group === "Actions");
    expect(actionItems).toHaveLength(4);

    const labels = actionItems.map((item) => item.label);
    expect(labels).toContain("New Reservation");
    expect(labels).toContain("Walk-in guest");
    expect(labels).toContain("New Floor Plan");
    expect(labels).toContain("Toggle Theme");
    expect(labels).not.toContain("Sign Out");
  });

  it("navigating via item calls navigate", () => {
    const { result } = renderHook(() => useCommandPalette(defaultOptions));

    const dashboardItem = result.current.items.find((item) => item.id === "dashboard");
    dashboardItem?.onSelect!();

    expect(mockRunAction).toHaveBeenCalledWith({ type: "route", path: "/dashboard" });
  });

  it("toggle theme action calls toggleTheme", () => {
    const { result } = renderHook(() => useCommandPalette(defaultOptions));

    const themeItem = result.current.items.find((item) => item.id === "action-toggle-theme");
    themeItem?.onSelect!();

    expect(mockToggleTheme).toHaveBeenCalled();
  });

  it("a chat nav item runs the chat action and never routes to a sentinel path", () => {
    const sections: NavSection[] = [
      { label: "Tools", items: [{ id: "chat", label: "Chat", action: { type: "chat" } }] },
    ];
    const { result } = renderHook(() => useCommandPalette({ ...defaultOptions, sections }));

    result.current.items.find((item) => item.id === "chat")?.onSelect!();

    expect(mockRunAction).toHaveBeenCalledWith({ type: "chat" });
    expect(mockRunAction).not.toHaveBeenCalledWith({ type: "route", path: "/__chat__" });
  });

  it("a signout nav item runs the signout action", () => {
    const sections: NavSection[] = [
      {
        label: "Account",
        items: [{ id: "signout", label: "Sign Out", action: { type: "signout" } }],
      },
    ];
    const { result } = renderHook(() => useCommandPalette({ ...defaultOptions, sections }));

    result.current.items.find((item) => item.id === "signout")?.onSelect!();

    expect(mockRunAction).toHaveBeenCalledWith({ type: "signout" });
  });

  it("builds groups with Actions first, then the nav sections in order", () => {
    const { result } = renderHook(() => useCommandPalette(defaultOptions));

    expect(result.current.groups[0]).toBe("Actions");
    expect(result.current.groups).toEqual(["Actions", "Main", "Settings"]);
  });

  it("deduplicates section group names", () => {
    const sectionsWithDupes: NavSection[] = [
      { label: "Main", items: [{ id: "a", label: "A", action: { type: "route", path: "/a" } }] },
      { label: "Main", items: [{ id: "b", label: "B", action: { type: "route", path: "/b" } }] },
    ];

    const { result } = renderHook(() =>
      useCommandPalette({ ...defaultOptions, sections: sectionsWithDupes })
    );

    expect(result.current.groups).toEqual(["Actions", "Main"]);
  });

  it("uses 'Navigation' as group name for sections without label", () => {
    const sectionsNoLabel: NavSection[] = [
      { items: [{ id: "home", label: "Home", action: { type: "route", path: "/" } }] },
    ];

    const { result } = renderHook(() =>
      useCommandPalette({ ...defaultOptions, sections: sectionsNoLabel })
    );

    const homeItem = result.current.items.find((item) => item.id === "home");
    expect(homeItem?.group).toBe("Navigation");
    expect(result.current.groups).toContain("Navigation");
  });

  it("walk-in action navigates with query param", () => {
    const { result } = renderHook(() => useCommandPalette(defaultOptions));

    const walkinItem = result.current.items.find((item) => item.id === "action-walkin");
    walkinItem?.onSelect!();

    expect(mockRunAction).toHaveBeenCalledWith({ type: "route", path: "/timeline?walkin=true" });
  });

  it("new reservation action navigates to the Reservations page carrying the new=true intent (architecture § Amendment 2026-09-04)", () => {
    const { result } = renderHook(() => useCommandPalette(defaultOptions));

    const item = result.current.items.find((i) => i.id === "action-new-reservation");
    expect(item?.label).toBe("New Reservation");
    item?.onSelect!();

    expect(mockRunAction).toHaveBeenCalledWith({ type: "route", path: "/reservations?new=true" });
  });
});
