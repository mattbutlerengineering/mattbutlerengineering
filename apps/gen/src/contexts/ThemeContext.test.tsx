import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import { ThemeProvider, useTheme } from "./ThemeContext.js";

/** Mock `window.matchMedia` for the `(prefers-color-scheme: dark)` query,
 * mirroring the pattern already used in ../hooks/usePanelLayout.test.ts and
 * packages/rialto/src/hooks/useThemeState.test.ts. */
function mockMatchMedia(prefersDark: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" && prefersDark,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  localStorage.clear();
  // Default: system prefers light, no explicit choice stored.
  mockMatchMedia(false);
});

describe("ThemeProvider", () => {
  it("renders children", () => {
    render(
      <ThemeProvider>
        <div>hello</div>
      </ThemeProvider>
    );
    expect(screen.getByText("hello")).toBeTruthy();
  });

  it("resolves dark when the system prefers dark and no explicit choice is stored", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    });
    expect(result.current.theme).toBe("dark");
  });

  it("resolves light when the system prefers light and no explicit choice is stored", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    });
    expect(result.current.theme).toBe("light");
  });

  it("an explicit stored choice wins over the system preference", () => {
    localStorage.setItem("mbe-theme-preference", "light");
    mockMatchMedia(true);
    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    });
    expect(result.current.theme).toBe("light");
  });

  it("toggleTheme switches from light to dark", () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    });
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe("dark");
  });

  it("toggleTheme switches back to light from dark", () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    });
    act(() => {
      result.current.toggleTheme();
    });
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe("light");
  });

  it("persists theme to localStorage on toggle", () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    });
    act(() => {
      result.current.toggleTheme();
    });
    expect(localStorage.getItem("mbe-theme-preference")).toBe("dark");
  });

  it("reads initial theme from localStorage", () => {
    localStorage.setItem("mbe-theme-preference", "dark");
    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    });
    expect(result.current.theme).toBe("dark");
  });
});

describe("useTheme outside provider", () => {
  it("throws an error when used outside ThemeProvider", () => {
    // Suppress expected console.error from React error boundary
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useTheme())).toThrow(
      "useTheme must be used within a ThemeProvider"
    );
    consoleSpy.mockRestore();
  });
});
