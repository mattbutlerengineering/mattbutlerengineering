// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const mockUseAuth = vi.fn();

vi.mock("./hooks.js", () => ({
  useAuth: () => mockUseAuth(),
}));

import { useAuthGate } from "./auth-gate.js";

describe("useAuthGate", () => {
  beforeEach(() => {
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
});
