// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { AuthUser } from "@mbe/auth/types";

// Mock only useAuth's dependency boundary (the OIDC provider). useIsAdmin itself
// is never mocked here — its permission-array derivation runs for real, unlike
// RequireAdmin.test.tsx which mocks useIsAdmin directly and only asserts on the
// mocked boolean.
const mockUseAuth = vi.fn();

vi.mock("@mbe/auth/react", () => ({
  useAuth: () => mockUseAuth(),
}));

import { useIsAdmin } from "./useIsAdmin.js";

function authState(user: AuthUser | null) {
  return {
    isLoading: false,
    isAuthenticated: user !== null,
    user,
    accessToken: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    signInSilent: vi.fn(),
    error: undefined,
  };
}

function makeUser(permissions: unknown): AuthUser {
  return {
    id: "auth0|user-123",
    email: "test@example.com",
    raw: { sub: "auth0|user-123", permissions } as AuthUser["raw"],
  };
}

describe("useIsAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when the user's permissions include admin", () => {
    mockUseAuth.mockReturnValue(authState(makeUser(["admin"])));

    const { result } = renderHook(() => useIsAdmin());

    expect(result.current).toBe(true);
  });

  it("returns false when the user has no permissions field", () => {
    mockUseAuth.mockReturnValue(authState(makeUser(undefined)));

    const { result } = renderHook(() => useIsAdmin());

    expect(result.current).toBe(false);
  });

  it("returns false when permissions is an empty array", () => {
    mockUseAuth.mockReturnValue(authState(makeUser([])));

    const { result } = renderHook(() => useIsAdmin());

    expect(result.current).toBe(false);
  });

  it("returns false when permissions is a non-array value", () => {
    mockUseAuth.mockReturnValue(authState(makeUser("admin")));

    const { result } = renderHook(() => useIsAdmin());

    expect(result.current).toBe(false);
  });

  it("returns false for an unauthenticated user", () => {
    mockUseAuth.mockReturnValue(authState(null));

    const { result } = renderHook(() => useIsAdmin());

    expect(result.current).toBe(false);
  });
});
