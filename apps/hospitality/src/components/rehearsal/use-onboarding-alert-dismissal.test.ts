import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { onboardingAlertKey, useOnboardingAlertDismissal } from "./use-onboarding-alert-dismissal";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useOnboardingAlertDismissal", () => {
  it("keys the flag per venue", () => {
    expect(onboardingAlertKey("v1")).toBe("rehearsal.onboardingAlert.dismissed.v1");
  });

  it("starts undismissed and persists a dismissal as '1'", () => {
    const { result } = renderHook(() => useOnboardingAlertDismissal("v1"));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem("rehearsal.onboardingAlert.dismissed.v1")).toBe("1");
  });

  it("stays dismissed on remount for the same venue only", () => {
    localStorage.setItem("rehearsal.onboardingAlert.dismissed.v1", "1");
    expect(renderHook(() => useOnboardingAlertDismissal("v1")).result.current[0]).toBe(true);
    expect(renderHook(() => useOnboardingAlertDismissal("v2")).result.current[0]).toBe(false);
  });

  it("still shows the alert, and dismissal lasts for the mounted page, when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useOnboardingAlertDismissal("v1"));
    expect(result.current[0]).toBe(false);
    expect(() => act(() => result.current[1]())).not.toThrow();
    expect(result.current[0]).toBe(true);
  });
});
