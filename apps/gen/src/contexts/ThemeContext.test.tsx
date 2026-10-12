import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { RialtoProvider, THEME_STORAGE_KEY } from "@mattbutlerengineering/rialto";
import { useTheme } from "./ThemeContext.js";

type Listener = () => void;

/** matchMedia stub whose dark-mode result can be flipped, firing change listeners. */
function stubOsColorScheme(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<Listener>();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      get matches() {
        return query === "(prefers-color-scheme: dark)" && dark;
      },
      media: query,
      addEventListener: (_: string, l: Listener) => listeners.add(l),
      removeEventListener: (_: string, l: Listener) => listeners.delete(l),
      addListener: (l: Listener) => listeners.add(l),
      removeListener: (l: Listener) => listeners.delete(l),
      dispatchEvent: () => false,
    }),
  });
  return (next: boolean) => {
    dark = next;
    listeners.forEach((l) => l());
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return <RialtoProvider persistTheme>{children}</RialtoProvider>;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("gen theme (RialtoProvider persistTheme)", () => {
  it("resolves from the OS when nothing is stored", () => {
    stubOsColorScheme(true);
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("dark");
  });

  it("an explicit stored choice wins over the OS", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    stubOsColorScheme(true);
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("light");
  });

  it("follows an OS switch while 'system' is stored (#6449)", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "system");
    const setOsDark = stubOsColorScheme(false);
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("light");

    act(() => setOsDark(true));

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("toggleTheme flips the theme and persists it", () => {
    stubOsColorScheme(false);
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });
});

describe("useTheme outside RialtoProvider persistTheme", () => {
  it("throws", () => {
    stubOsColorScheme(false);
    expect(() => renderHook(() => useTheme())).toThrow(/persistTheme/);
  });
});
