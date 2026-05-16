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
        { id: "dashboard", label: "Dashboard", path: "/dashboard" },
        { id: "timeline", label: "Timeline", path: "/timeline" },
      ],
    },
    {
      label: "Settings",
      items: [
        { id: "profile", label: "Profile", path: "/profile" },
      ],
    },
  ];

  const mockNavigate = vi.fn();
  const mockToggleTheme = vi.fn();
  const mockSignOut = vi.fn();

  const defaultOptions = {
    sections: mockSections,
    navigate: mockNavigate,
    toggleTheme: mockToggleTheme,
    signOut: mockSignOut,
  };

  it("returns open as false initially", () => {
    const { result } = renderHook(() => useCommandPalette(defaultOptions));
    expect(result.current.open).toBe(false);
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
    expect(actionItems).toHaveLength(5);

    const labels = actionItems.map((item) => item.label);
    expect(labels).toContain("New Reservation");
    expect(labels).toContain("Walk-in Guest");
    expect(labels).toContain("New Floor Plan");
    expect(labels).toContain("Toggle Theme");
    expect(labels).toContain("Sign Out");
  });

  it("navigating via item calls navigate", () => {
    const { result } = renderHook(() => useCommandPalette(defaultOptions));

    const dashboardItem = result.current.items.find((item) => item.id === "dashboard");
    dashboardItem?.onSelect();

    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("toggle theme action calls toggleTheme", () => {
    const { result } = renderHook(() => useCommandPalette(defaultOptions));

    const themeItem = result.current.items.find((item) => item.id === "action-toggle-theme");
    themeItem?.onSelect();

    expect(mockToggleTheme).toHaveBeenCalled();
  });

  it("sign out action calls signOut", () => {
    const { result } = renderHook(() => useCommandPalette(defaultOptions));

    const signOutItem = result.current.items.find((item) => item.id === "action-sign-out");
    signOutItem?.onSelect();

    expect(mockSignOut).toHaveBeenCalled();
  });

  it("builds groups in correct order", () => {
    const { result } = renderHook(() => useCommandPalette(defaultOptions));

    expect(result.current.groups).toEqual(["Main", "Settings", "Actions"]);
  });

  it("deduplicates section group names", () => {
    const sectionsWithDupes: NavSection[] = [
      { label: "Main", items: [{ id: "a", label: "A", path: "/a" }] },
      { label: "Main", items: [{ id: "b", label: "B", path: "/b" }] },
    ];

    const { result } = renderHook(() =>
      useCommandPalette({ ...defaultOptions, sections: sectionsWithDupes })
    );

    expect(result.current.groups).toEqual(["Main", "Actions"]);
  });

  it("uses 'Navigation' as group name for sections without label", () => {
    const sectionsNoLabel: NavSection[] = [
      { items: [{ id: "home", label: "Home", path: "/" }] },
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
    walkinItem?.onSelect();

    expect(mockNavigate).toHaveBeenCalledWith("/timeline?walkin=true");
  });
});
