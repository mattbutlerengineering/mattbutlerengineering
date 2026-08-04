import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { readTokenValue, useDocumentTheme, useLiveTokenValues } from "./use-live-tokens.js";

const VALUES: Record<string, Record<string, string>> = {
  light: {
    "--rialto-surface": "#f8f6f3",
    "--rialto-accent": "#b0841e",
  },
  dark: {
    "--rialto-surface": "#1e1c1a",
    "--rialto-accent": "#d4a23a",
  },
};

function stubComputedTokens(): void {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation(((
    el: Element,
    pseudo?: string | null
  ) => {
    const base = real(el, pseudo ?? undefined);
    if (el !== document.documentElement) return base;
    const theme = document.documentElement.getAttribute("data-theme") ?? "light";
    return {
      ...base,
      getPropertyValue: (name: string) => VALUES[theme]?.[name] ?? base.getPropertyValue(name),
    } as CSSStyleDeclaration;
  }) as typeof window.getComputedStyle);
}

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-theme");
});

describe("readTokenValue", () => {
  it("returns the trimmed live value of a custom property from the document root", () => {
    stubComputedTokens();
    document.documentElement.setAttribute("data-theme", "light");
    expect(readTokenValue("--rialto-surface")).toBe("#f8f6f3");
  });
});

describe("useDocumentTheme", () => {
  it("reads the current data-theme attribute", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { result } = renderHook(() => useDocumentTheme());
    expect(result.current).toBe("dark");
  });

  it("defaults to light when the attribute is absent", () => {
    const { result } = renderHook(() => useDocumentTheme());
    expect(result.current).toBe("light");
  });

  it("updates reactively when the root theme changes", async () => {
    document.documentElement.setAttribute("data-theme", "light");
    const { result } = renderHook(() => useDocumentTheme());
    expect(result.current).toBe("light");
    await act(async () => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    expect(result.current).toBe("dark");
  });
});

describe("useLiveTokenValues", () => {
  const NAMES = ["--rialto-surface", "--rialto-accent"] as const;

  it("resolves each requested token from the live cascade", () => {
    stubComputedTokens();
    document.documentElement.setAttribute("data-theme", "light");
    const { result } = renderHook(() => useLiveTokenValues(NAMES));
    expect(result.current).toEqual({
      "--rialto-surface": "#f8f6f3",
      "--rialto-accent": "#b0841e",
    });
  });

  it("re-resolves to the other theme's values when the root theme flips", async () => {
    stubComputedTokens();
    document.documentElement.setAttribute("data-theme", "light");
    const { result } = renderHook(() => useLiveTokenValues(NAMES));
    expect(result.current["--rialto-surface"]).toBe("#f8f6f3");
    await act(async () => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    expect(result.current["--rialto-surface"]).toBe("#1e1c1a");
    expect(result.current["--rialto-accent"]).toBe("#d4a23a");
  });
});
