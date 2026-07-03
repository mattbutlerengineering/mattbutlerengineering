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

describe("useApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("constructs an ApiClient with a getAccessToken callback returning the current token", () => {
    vi.mocked(useAuth).mockReturnValue({ accessToken: "test-token-123" } as any);

    renderHook(() => useApi());

    expect(ApiClient).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "", getAccessToken: expect.any(Function) })
    );
    const callArgs = vi.mocked(ApiClient).mock.calls[0][0] as {
      getAccessToken: () => string | null;
    };
    expect(callArgs.getAccessToken()).toBe("test-token-123");
  });

  it("returns null from getAccessToken when unauthenticated (public route)", () => {
    vi.mocked(useAuth).mockReturnValue({ accessToken: null } as any);

    renderHook(() => useApi());

    const callArgs = vi.mocked(ApiClient).mock.calls[0][0] as {
      getAccessToken: () => string | null;
    };
    expect(callArgs.getAccessToken()).toBeNull();
  });

  it("memoizes the client across renders with the same token", () => {
    vi.mocked(useAuth).mockReturnValue({ accessToken: "stable-token" } as any);

    const { result, rerender } = renderHook(() => useApi());
    const firstClient = result.current;

    rerender();
    expect(result.current).toBe(firstClient);
  });

  it("creates a new client when the access token changes", () => {
    vi.mocked(useAuth).mockReturnValue({ accessToken: "token-1" } as any);

    const { result, rerender } = renderHook(() => useApi());
    const firstClient = result.current;

    vi.mocked(useAuth).mockReturnValue({ accessToken: "token-2" } as any);
    rerender();

    expect(result.current).not.toBe(firstClient);
  });
});
