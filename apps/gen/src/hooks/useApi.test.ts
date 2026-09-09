import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useApi } from "./useApi.js";
import { useAuth } from "@mbe/auth/react";
import { ApiClient } from "@mbe/api-client";

vi.mock("@mbe/auth/react", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@mbe/api-client", () => ({
  ApiClient: vi.fn(function (this: unknown) {
    return this;
  }),
}));

/** Builds a fully-typed `useAuth()` return value with only `accessToken` varied. */
function mockAuthState(accessToken: string | null): ReturnType<typeof useAuth> {
  return {
    isLoading: false,
    isAuthenticated: accessToken !== null,
    user: null,
    accessToken,
    signIn: vi.fn(),
    signOut: vi.fn(),
    signInSilent: vi.fn(),
    error: undefined,
    activeNavigator: undefined,
    isRefreshing: false,
    sessionExpired: false,
    refreshError: null,
  };
}

describe("useApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("constructs an ApiClient with a getAccessToken callback returning the current token", () => {
    vi.mocked(useAuth).mockReturnValue(mockAuthState("test-token-123"));

    renderHook(() => useApi());

    expect(ApiClient).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "", getAccessToken: expect.any(Function) })
    );
    const callArgs = vi.mocked(ApiClient).mock.calls[0]?.[0] as {
      getAccessToken: () => string | null;
    };
    expect(callArgs.getAccessToken()).toBe("test-token-123");
  });

  it("returns null from getAccessToken when unauthenticated (public route)", () => {
    vi.mocked(useAuth).mockReturnValue(mockAuthState(null));

    renderHook(() => useApi());

    const callArgs = vi.mocked(ApiClient).mock.calls[0]?.[0] as {
      getAccessToken: () => string | null;
    };
    expect(callArgs.getAccessToken()).toBeNull();
  });

  it("memoizes the client across renders with the same token", () => {
    vi.mocked(useAuth).mockReturnValue(mockAuthState("stable-token"));

    const { result, rerender } = renderHook(() => useApi());
    const firstClient = result.current;

    rerender();
    expect(result.current).toBe(firstClient);
  });

  it("creates a new client when the access token changes", () => {
    vi.mocked(useAuth).mockReturnValue(mockAuthState("token-1"));

    const { result, rerender } = renderHook(() => useApi());
    const firstClient = result.current;

    vi.mocked(useAuth).mockReturnValue(mockAuthState("token-2"));
    rerender();

    expect(result.current).not.toBe(firstClient);
  });
});
