import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTheme, ThemeContext, useThemeState } from "./use-theme.js";
import { useThemeState as useSharedThemeState } from "@mattbutlerengineering/rialto";
import React from "react";

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
    } as any);

    const { result } = renderHook(() => useThemeState());
    expect(result.current.theme).toBe("system");
    result.current.setTheme("dark");
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });
});
