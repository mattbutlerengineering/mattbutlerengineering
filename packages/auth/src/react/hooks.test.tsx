// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import "@testing-library/jest-dom";

// Mock react-oidc-context before importing the hooks
const mockSigninRedirect = vi.fn();
const mockSignoutRedirect = vi.fn();
const mockSigninSilent = vi.fn();

const mockUseAuth = vi.fn();

vi.mock("react-oidc-context", () => ({
  useAuth: () => mockUseAuth(),
}));

import { useAuth, useAccessToken, useRequireAuth } from "./hooks.js";

const makeOIDCAuth = (overrides: Record<string, unknown> = {}) => ({
  isLoading: false,
  isAuthenticated: false,
  user: null,
  error: undefined,
  signinRedirect: mockSigninRedirect,
  signoutRedirect: mockSignoutRedirect,
  signinSilent: mockSigninSilent,
  ...overrides,
});

const makeOIDCUser = (overrides: Record<string, unknown> = {}) => ({
  access_token: "access-token-123",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  profile: {
    sub: "auth0|user-123",
    email: "test@example.com",
    email_verified: true,
    name: "Test User",
    picture: "https://example.com/pic.jpg",
    iss: "https://test.auth0.com/",
    aud: "https://api.example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  },
  ...overrides,
});

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unauthenticated state when user is null", () => {
    mockUseAuth.mockReturnValue(makeOIDCAuth());

    const { result } = renderHook(() => useAuth());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.accessToken).toBeNull();
    expect(result.current.error).toBeUndefined();
  });

  it("returns authenticated state with user when user is set", () => {
    const oidcUser = makeOIDCUser();
    mockUseAuth.mockReturnValue(makeOIDCAuth({ isAuthenticated: true, user: oidcUser }));

    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual({
      id: "auth0|user-123",
      email: "test@example.com",
      emailVerified: true,
      name: "Test User",
      picture: "https://example.com/pic.jpg",
      raw: oidcUser.profile,
    });
    expect(result.current.accessToken).toBe("access-token-123");
  });

  it("returns loading state", () => {
    mockUseAuth.mockReturnValue(makeOIDCAuth({ isLoading: true }));

    const { result } = renderHook(() => useAuth());

    expect(result.current.isLoading).toBe(true);
  });

  it("returns error when auth has error", () => {
    const error = new Error("Auth error");
    mockUseAuth.mockReturnValue(makeOIDCAuth({ error }));

    const { result } = renderHook(() => useAuth());

    expect(result.current.error).toBe(error);
  });

  it("calls signinRedirect when signIn is invoked", () => {
    mockUseAuth.mockReturnValue(makeOIDCAuth());

    const { result } = renderHook(() => useAuth());
    act(() => {
      result.current.signIn();
    });

    expect(mockSigninRedirect).toHaveBeenCalledOnce();
  });

  it("calls signoutRedirect when signOut is invoked", () => {
    mockUseAuth.mockReturnValue(makeOIDCAuth());

    const { result } = renderHook(() => useAuth());
    act(() => {
      result.current.signOut();
    });

    expect(mockSignoutRedirect).toHaveBeenCalledOnce();
  });

  it("calls signinSilent when signInSilent is invoked", () => {
    mockSigninSilent.mockResolvedValue(null);
    mockUseAuth.mockReturnValue(makeOIDCAuth());

    const { result } = renderHook(() => useAuth());
    act(() => {
      result.current.signInSilent();
    });

    expect(mockSigninSilent).toHaveBeenCalledOnce();
  });

  it("maps user profile fields correctly when optional fields are missing", () => {
    const oidcUser = makeOIDCUser({
      profile: {
        sub: "auth0|user-456",
        iss: "https://test.auth0.com/",
        aud: "https://api.example.com",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        // email, name, picture, email_verified all absent
      },
    });
    mockUseAuth.mockReturnValue(makeOIDCAuth({ isAuthenticated: true, user: oidcUser }));

    const { result } = renderHook(() => useAuth());

    expect(result.current.user?.id).toBe("auth0|user-456");
    expect(result.current.user?.email).toBeUndefined();
    expect(result.current.user?.name).toBeUndefined();
    expect(result.current.user?.picture).toBeUndefined();
    expect(result.current.user?.emailVerified).toBeUndefined();
  });
});

describe("useAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when user is not authenticated", () => {
    mockUseAuth.mockReturnValue(makeOIDCAuth());

    const { result } = renderHook(() => useAccessToken());

    expect(result.current).toBeNull();
  });

  it("returns access token when user is authenticated", () => {
    const oidcUser = makeOIDCUser();
    mockUseAuth.mockReturnValue(makeOIDCAuth({ isAuthenticated: true, user: oidcUser }));

    const { result } = renderHook(() => useAccessToken());

    expect(result.current).toBe("access-token-123");
  });

  it("does not call signinSilent when token expiry is far in the future", () => {
    const oidcUser = makeOIDCUser({
      expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour away
    });
    mockUseAuth.mockReturnValue(makeOIDCAuth({ isAuthenticated: true, user: oidcUser }));

    renderHook(() => useAccessToken());

    expect(mockSigninSilent).not.toHaveBeenCalled();
  });

  it("calls signinSilent when token expires within 5 minutes", () => {
    mockSigninSilent.mockResolvedValue(null);
    const oidcUser = makeOIDCUser({
      expires_at: Math.floor(Date.now() / 1000) + 240, // 4 minutes away
    });
    mockUseAuth.mockReturnValue(makeOIDCAuth({ isAuthenticated: true, user: oidcUser }));

    renderHook(() => useAccessToken());

    expect(mockSigninSilent).toHaveBeenCalledOnce();
  });

  it("swallows rejection from signinSilent during silent refresh", async () => {
    mockSigninSilent.mockRejectedValue(new Error("refresh failed"));
    const oidcUser = makeOIDCUser({
      expires_at: Math.floor(Date.now() / 1000) + 240,
    });
    mockUseAuth.mockReturnValue(makeOIDCAuth({ isAuthenticated: true, user: oidcUser }));

    // Should not throw
    expect(() => renderHook(() => useAccessToken())).not.toThrow();
  });

  it("does not call signinSilent when expiresAt is undefined", () => {
    const oidcUser = makeOIDCUser({ expires_at: undefined });
    mockUseAuth.mockReturnValue(makeOIDCAuth({ isAuthenticated: true, user: oidcUser }));

    renderHook(() => useAccessToken());

    expect(mockSigninSilent).not.toHaveBeenCalled();
  });
});

describe("useRequireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls signIn when not loading and not authenticated", () => {
    mockUseAuth.mockReturnValue(makeOIDCAuth({ isLoading: false, isAuthenticated: false }));

    renderHook(() => useRequireAuth());

    expect(mockSigninRedirect).toHaveBeenCalledOnce();
  });

  it("does not call signIn when loading", () => {
    mockUseAuth.mockReturnValue(makeOIDCAuth({ isLoading: true, isAuthenticated: false }));

    renderHook(() => useRequireAuth());

    expect(mockSigninRedirect).not.toHaveBeenCalled();
  });

  it("does not call signIn when authenticated", () => {
    const oidcUser = makeOIDCUser();
    mockUseAuth.mockReturnValue(
      makeOIDCAuth({ isLoading: false, isAuthenticated: true, user: oidcUser })
    );

    renderHook(() => useRequireAuth());

    expect(mockSigninRedirect).not.toHaveBeenCalled();
  });

  it("returns auth state including user info", () => {
    const oidcUser = makeOIDCUser();
    mockUseAuth.mockReturnValue(makeOIDCAuth({ isAuthenticated: true, user: oidcUser }));

    const { result } = renderHook(() => useRequireAuth());

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.id).toBe("auth0|user-123");
    expect(result.current.accessToken).toBe("access-token-123");
  });

  it("triggers sign-in redirect when state transitions from loading to unauthenticated", () => {
    mockUseAuth.mockReturnValue(makeOIDCAuth({ isLoading: true, isAuthenticated: false }));

    const { rerender } = renderHook(() => useRequireAuth());
    expect(mockSigninRedirect).not.toHaveBeenCalled();

    mockUseAuth.mockReturnValue(makeOIDCAuth({ isLoading: false, isAuthenticated: false }));

    act(() => {
      rerender();
    });

    expect(mockSigninRedirect).toHaveBeenCalledOnce();
  });
});
