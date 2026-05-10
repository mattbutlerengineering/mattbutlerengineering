/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useApiClient } from "./useApiClient.js";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";

vi.mock("@mbe/auth/react", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@mbe/api-client", () => ({
  createApiClient: vi.fn(() => ({ reservations: { list: vi.fn() } })),
}));

vi.mock("@mbe/observability/sentry/react", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

describe("useApiClient", () => {
  it("creates an API client with the access token", () => {
    vi.mocked(useAuth).mockReturnValue({
      accessToken: "test-token-123",
    } as any);

    renderHook(() => useApiClient());

    expect(createApiClient).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: expect.any(String),
      })
    );

    // Verify the getAccessToken function returns the token
    const callArgs = vi.mocked(createApiClient).mock.calls[0][0];
    expect(callArgs.getAccessToken()).toBe("test-token-123");
  });

  it("memoizes the client across renders with same token", () => {
    vi.mocked(useAuth).mockReturnValue({
      accessToken: "stable-token",
    } as any);

    const { result, rerender } = renderHook(() => useApiClient());
    const firstClient = result.current;

    rerender();
    expect(result.current).toBe(firstClient);
  });

  it("creates a new client when access token changes", () => {
    vi.mocked(useAuth).mockReturnValue({
      accessToken: "token-1",
    } as any);

    const { rerender } = renderHook(() => useApiClient());

    const firstCallCount = vi.mocked(createApiClient).mock.calls.length;

    vi.mocked(useAuth).mockReturnValue({
      accessToken: "token-2",
    } as any);

    rerender();

    expect(vi.mocked(createApiClient).mock.calls.length).toBeGreaterThan(firstCallCount);
  });

  it("passes an onError callback for Sentry reporting", () => {
    vi.mocked(useAuth).mockReturnValue({
      accessToken: "token",
    } as any);

    renderHook(() => useApiClient());

    const callArgs = vi.mocked(createApiClient).mock.calls[0][0];
    expect(callArgs.onError).toBeTypeOf("function");
  });
});
