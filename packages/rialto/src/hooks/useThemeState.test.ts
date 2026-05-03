import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveTheme, useThemeState } from "./useThemeState";
import { renderHook, act } from "@testing-library/react";

describe("resolveTheme", () => {
  it("returns 'light' for light preference", () => {
    expect(resolveTheme("light")).toBe("light");
  });

  it("returns 'dark' for dark preference", () => {
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("returns 'dark' for system when prefers-color-scheme is dark", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: query === "(prefers-color-scheme: dark)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    expect(resolveTheme("system")).toBe("dark");
  });
});

describe("useThemeState", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("initializes with system preference by default", () => {
    const { result } = renderHook(() => useThemeState());
    expect(result.current.preference).toBe("system");
  });

  it("persists theme preference to localStorage", () => {
    const { result } = renderHook(() => useThemeState());

    act(() => {
      result.current.setTheme("dark");
    });

    expect(result.current.preference).toBe("dark");
    expect(localStorage.getItem("mbe-theme-preference")).toBe("dark");
  });

  it("toggles theme between light and dark", () => {
    const { result } = renderHook(() => useThemeState());

    // Default system might be light/dark, but toggle should switch it
    const initialTheme = result.current.theme;

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).not.toBe(initialTheme);
  });
});
