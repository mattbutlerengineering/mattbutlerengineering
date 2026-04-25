import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveTheme } from "./use-theme.ts";

describe("resolveTheme", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 'light' for light preference", () => {
    expect(resolveTheme("light")).toBe("light");
  });

  it("returns 'dark' for dark preference", () => {
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("returns 'dark' for system when prefers-color-scheme is dark", () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: query === '(prefers-color-scheme: dark)',
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

  it("returns 'light' for system when prefers-color-scheme is light", () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    expect(resolveTheme("system")).toBe("light");
  });
});
