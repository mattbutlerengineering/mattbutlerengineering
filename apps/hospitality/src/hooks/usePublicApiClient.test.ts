/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePublicApiClient } from "./usePublicApiClient.js";
import { createApiClient } from "@mbe/api-client";

vi.mock("@mbe/api-client", () => ({
  createApiClient: vi.fn(() => ({ publicVenue: { getBySlug: vi.fn() } })),
}));

describe("usePublicApiClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an API client with no access token (public/unauthenticated)", () => {
    renderHook(() => usePublicApiClient());

    expect(createApiClient).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: expect.any(String),
        getAccessToken: expect.any(Function),
      })
    );

    const callArgs = vi.mocked(createApiClient).mock.calls[0][0] as any;
    expect(callArgs.getAccessToken()).toBeNull();
  });

  it("defaults baseUrl to VITE_API_URL when no override is passed", () => {
    renderHook(() => usePublicApiClient());

    const callArgs = vi.mocked(createApiClient).mock.calls[0][0] as any;
    expect(callArgs.baseUrl).toBe(import.meta.env.VITE_API_URL ?? "");
  });

  it("passes through an explicit baseUrl override", () => {
    renderHook(() => usePublicApiClient({ baseUrl: "https://example.test" }));

    const callArgs = vi.mocked(createApiClient).mock.calls[0][0] as any;
    expect(callArgs.baseUrl).toBe("https://example.test");
  });

  it("passes through maxRetries when provided", () => {
    renderHook(() => usePublicApiClient({ maxRetries: 0 }));

    const callArgs = vi.mocked(createApiClient).mock.calls[0][0] as any;
    expect(callArgs.maxRetries).toBe(0);
  });

  it("memoizes the client across renders with the same options", () => {
    const { result, rerender } = renderHook(() => usePublicApiClient({ baseUrl: "https://a" }));
    const firstClient = result.current;

    rerender();
    expect(result.current).toBe(firstClient);
  });

  it("creates a new client when baseUrl changes", () => {
    let baseUrl = "https://a";
    const { result, rerender } = renderHook(() => usePublicApiClient({ baseUrl }));
    const firstClient = result.current;

    baseUrl = "https://b";
    rerender();

    expect(result.current).not.toBe(firstClient);
  });
});
