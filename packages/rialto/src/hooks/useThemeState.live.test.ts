import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { stubMatchMedia, setMatchingMedia } from "../test/match-media";
import { THEME_STORAGE_KEY, useThemeState } from "./useThemeState";

const DARK = "(prefers-color-scheme: dark)";

describe("useThemeState live tracking", () => {
  beforeEach(() => {
    localStorage.clear();
    stubMatchMedia([]);
  });

  it("follows an OS dark-mode switch while 'system' is stored", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "system");
    const { result } = renderHook(() => useThemeState());
    expect(result.current.theme).toBe("light");

    act(() => setMatchingMedia([DARK]));

    expect(result.current.preference).toBe("system");
    expect(result.current.theme).toBe("dark");
  });

  it("ignores OS switches when an explicit preference is stored", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    const { result } = renderHook(() => useThemeState());

    act(() => setMatchingMedia([DARK]));

    expect(result.current.theme).toBe("light");
  });

  it("shares a preference change between hook instances", () => {
    const a = renderHook(() => useThemeState());
    const b = renderHook(() => useThemeState());

    act(() => a.result.current.setTheme("dark"));

    expect(b.result.current.preference).toBe("dark");
  });

  it("picks up a preference written by another tab", () => {
    const { result } = renderHook(() => useThemeState());

    act(() => {
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY }));
    });

    expect(result.current.preference).toBe("dark");
  });
});
