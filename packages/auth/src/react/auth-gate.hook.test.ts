// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const mockUseAuth = vi.fn();
const mockStale = vi.fn();

vi.mock("./hooks.js", () => ({
  useAuth: () => mockUseAuth(),
  useStaleSession: () => mockStale(),
}));

import { useAuthGate } from "./auth-gate.js";

describe("useAuthGate", () => {
  beforeEach(() => {
    mockStale.mockReturnValue({ expiredForMs: undefined, clearSession: vi.fn() });
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      error: undefined,
      sessionExpired: false,
      activeNavigator: undefined,
    });
  });

  it("reads useAuth() and window.location — a bare /callback is signed out, not loading", () => {
    window.history.replaceState({}, "", "/gen/callback");
    const { result } = renderHook(() => useAuthGate());
    expect(result.current).toEqual({ phase: "signed-out", afterSignOut: true });
  });

  it("reads the OIDC params off window.location", () => {
    window.history.replaceState({}, "", "/gen/callback?code=abc&state=xyz");
    const { result } = renderHook(() => useAuthGate());
    expect(result.current).toEqual({ phase: "callback" });
  });

  it("removes the stored user when the session is stale", () => {
    const clearSession = vi.fn();
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      error: undefined,
      sessionExpired: true,
      activeNavigator: undefined,
    });
    mockStale.mockReturnValue({ expiredForMs: 25 * 60 * 60 * 1000, clearSession });
    window.history.replaceState({}, "", "/gen");
    const { result } = renderHook(() => useAuthGate());
    expect(result.current).toEqual({ phase: "signed-out", afterSignOut: false });
    expect(clearSession).toHaveBeenCalledTimes(1);
  });

  it("keeps a recently expired stored user", () => {
    const clearSession = vi.fn();
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      error: undefined,
      sessionExpired: true,
      activeNavigator: undefined,
    });
    mockStale.mockReturnValue({ expiredForMs: 60 * 60 * 1000, clearSession });
    window.history.replaceState({}, "", "/gen");
    const { result } = renderHook(() => useAuthGate());
    expect(result.current).toEqual({ phase: "expired" });
    expect(clearSession).not.toHaveBeenCalled();
  });
});
