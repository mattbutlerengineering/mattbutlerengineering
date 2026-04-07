import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveTheme } from "./use-theme.js";

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
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);

    expect(resolveTheme("system")).toBe("dark");
  });

  it("returns 'light' for system when prefers-color-scheme is light", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: false,
    } as MediaQueryList);

    expect(resolveTheme("system")).toBe("light");
  });
});
