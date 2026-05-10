import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCookieConsent, DEFAULT_PREFERENCES } from "./useCookieConsent.js";

const STORAGE_KEY = "rialto-cookie-consent";

describe("useCookieConsent", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns default state when no consent stored", () => {
    const { result } = renderHook(() => useCookieConsent());

    expect(result.current.consented).toBe(false);
    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it("acceptAll sets all preferences to true and marks consented", () => {
    const { result } = renderHook(() => useCookieConsent());

    act(() => {
      result.current.acceptAll();
    });

    expect(result.current.consented).toBe(true);
    expect(result.current.preferences).toEqual({
      essential: true,
      analytics: true,
      functional: true,
      marketing: true,
    });
  });

  it("acceptAll persists to localStorage", () => {
    const { result } = renderHook(() => useCookieConsent());

    act(() => {
      result.current.acceptAll();
    });

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.consented).toBe(true);
    expect(stored.preferences.analytics).toBe(true);
  });

  it("rejectAll sets only essential to true and marks consented", () => {
    const { result } = renderHook(() => useCookieConsent());

    act(() => {
      result.current.rejectAll();
    });

    expect(result.current.consented).toBe(true);
    expect(result.current.preferences).toEqual({
      essential: true,
      analytics: false,
      functional: false,
      marketing: false,
    });
  });

  it("savePreferences saves custom choices with essential always true", () => {
    const { result } = renderHook(() => useCookieConsent());

    act(() => {
      result.current.savePreferences({
        analytics: true,
        functional: false,
        marketing: true,
      });
    });

    expect(result.current.consented).toBe(true);
    expect(result.current.preferences).toEqual({
      essential: true,
      analytics: true,
      functional: false,
      marketing: true,
    });
  });

  it("reset clears localStorage and resets state", () => {
    const { result } = renderHook(() => useCookieConsent());

    act(() => {
      result.current.acceptAll();
    });
    expect(result.current.consented).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.consented).toBe(false);
    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("restores consent from localStorage on mount", () => {
    const stored = {
      consented: true,
      preferences: {
        essential: true,
        analytics: true,
        functional: false,
        marketing: false,
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useCookieConsent());

    expect(result.current.consented).toBe(true);
    expect(result.current.preferences.analytics).toBe(true);
    expect(result.current.preferences.functional).toBe(false);
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem(STORAGE_KEY, "not-valid-json");

    const { result } = renderHook(() => useCookieConsent());

    expect(result.current.consented).toBe(false);
    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it("always forces essential to true even if storage says otherwise", () => {
    const stored = {
      consented: true,
      preferences: {
        essential: false, // Tampered value
        analytics: true,
        functional: true,
        marketing: true,
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useCookieConsent());

    expect(result.current.preferences.essential).toBe(true);
  });
});
