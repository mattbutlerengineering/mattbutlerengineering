import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTheme, ThemeContext, useThemeState, useThemeServerHydration } from "./use-theme.js";
import { useThemeState as useSharedThemeState } from "@mattbutlerengineering/rialto";
import React from "react";

const THEME_STORAGE_KEY = "mbe-theme-preference";

vi.mock("@mattbutlerengineering/rialto", () => ({
  useThemeState: vi.fn(),
  resolveTheme: vi.fn((t) => t),
}));

describe("useTheme", () => {
  it("returns theme from context", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeContext.Provider value={{ theme: "dark", setTheme: vi.fn() }}>
        {children}
      </ThemeContext.Provider>
    );

    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("dark");
  });
});

describe("useThemeState", () => {
  it("wraps shared theme state", () => {
    const mockSetTheme = vi.fn();
    vi.mocked(useSharedThemeState).mockReturnValue({
      preference: "system",
      setTheme: mockSetTheme,
      resolved: "light",
    } as unknown as ReturnType<typeof useSharedThemeState>);

    const { result } = renderHook(() => useThemeState());
    expect(result.current.theme).toBe("system");
    result.current.setTheme("dark");
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });
});

describe("useThemeServerHydration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function renderWithTheme(serverTheme: "light" | "dark" | "system" | undefined) {
    const setTheme = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeContext.Provider value={{ theme: "system", setTheme }}>
        {children}
      </ThemeContext.Provider>
    );
    renderHook(() => useThemeServerHydration(serverTheme), { wrapper });
    return { setTheme };
  }

  it("hydrates the local theme from the server preference when localStorage is empty", () => {
    const { setTheme } = renderWithTheme("dark");
    expect(setTheme).toHaveBeenCalledWith("dark");
    expect(setTheme).toHaveBeenCalledTimes(1);
  });

  it("never overwrites an explicit local choice", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    const { setTheme } = renderWithTheme("dark");
    expect(setTheme).not.toHaveBeenCalled();
  });

  it("does nothing while the server preference has not resolved yet", () => {
    const { setTheme } = renderWithTheme(undefined);
    expect(setTheme).not.toHaveBeenCalled();
  });
});
