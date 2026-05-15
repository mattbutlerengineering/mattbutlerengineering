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

/* ── reportToSentry (onError callback) tests ───────────────── */

describe("reportToSentry via onError", () => {
  function getOnError(): (error: any) => void {
    vi.mocked(useAuth).mockReturnValue({ accessToken: "tok" } as any);
    renderHook(() => useApiClient());
    const callArgs = vi.mocked(createApiClient).mock.calls.at(-1)![0];
    return callArgs.onError!;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls captureException for server errors (5xx)", async () => {
    const { captureException, addBreadcrumb } = await import("@mbe/observability/sentry/react");

    const onError = getOnError();
    const error = {
      statusCode: 500,
      method: "POST",
      path: "/api/v1/reservations",
      message: "Internal Server Error",
    };

    onError(error);

    expect(captureException).toHaveBeenCalledWith(error);
    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "api",
        level: "error",
        data: expect.objectContaining({ statusCode: 500 }),
      })
    );
  });

  it("calls captureMessage for 401 auth errors", async () => {
    const { captureMessage, captureException, addBreadcrumb } =
      await import("@mbe/observability/sentry/react");

    const onError = getOnError();
    const error = {
      statusCode: 401,
      method: "GET",
      path: "/api/v1/users/me",
      message: "Unauthorized",
    };

    onError(error);

    expect(captureMessage).toHaveBeenCalledWith("Unauthorized", "warning");
    expect(captureException).not.toHaveBeenCalled();
    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "api",
        level: "warning",
      })
    );
  });

  it("calls captureMessage for 403 forbidden errors", async () => {
    const { captureMessage, addBreadcrumb } = await import("@mbe/observability/sentry/react");

    const onError = getOnError();
    const error = {
      statusCode: 403,
      method: "DELETE",
      path: "/api/v1/venues/v1",
      message: "Forbidden",
    };

    onError(error);

    expect(captureMessage).toHaveBeenCalledWith("Forbidden", "warning");
    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "api",
        level: "warning",
        data: expect.objectContaining({ statusCode: 403 }),
      })
    );
  });

  it("calls addBreadcrumb but not captureException or captureMessage for 4xx client errors", async () => {
    const { captureException, captureMessage, addBreadcrumb } =
      await import("@mbe/observability/sentry/react");

    const onError = getOnError();
    const error = {
      statusCode: 404,
      method: "GET",
      path: "/api/v1/venues/missing",
      message: "Not Found",
    };

    onError(error);

    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "api",
        level: "warning",
        message: "GET /api/v1/venues/missing → 404",
      })
    );
    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("uses error level in breadcrumb for 5xx and warning for others", async () => {
    const { addBreadcrumb } = await import("@mbe/observability/sentry/react");

    const onError = getOnError();

    onError({ statusCode: 502, method: "GET", path: "/a", message: "Bad Gateway" });
    expect(addBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({ level: "error" }));

    vi.mocked(addBreadcrumb).mockClear();

    onError({ statusCode: 422, method: "POST", path: "/b", message: "Unprocessable" });
    expect(addBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({ level: "warning" }));
  });
});
