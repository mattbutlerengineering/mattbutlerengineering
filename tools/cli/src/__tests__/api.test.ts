import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../config.js", () => ({
  getApiUrl: vi.fn(() => "http://localhost:3001"),
  getAccessToken: vi.fn(() => undefined),
}));

import { getApiUrl, getAccessToken } from "../config.js";
import { apiRequest, ApiError } from "../api.js";

const mockGetApiUrl = vi.mocked(getApiUrl);
const mockGetAccessToken = vi.mocked(getAccessToken);

describe("apiRequest", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
    mockGetApiUrl.mockReturnValue("http://localhost:3001");
    mockGetAccessToken.mockReturnValue(undefined);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends request to correct URL with default headers", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: "test" }),
    });

    await apiRequest("/api/health");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/health",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("includes Authorization header when token is present", async () => {
    mockGetAccessToken.mockReturnValue("my-token");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    await apiRequest("/api/users");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer my-token",
        }),
      })
    );
  });

  it("omits Authorization header when no token", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    await apiRequest("/api/public");

    const calledHeaders = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers;
    expect(calledHeaders).not.toHaveProperty("Authorization");
  });

  it("throws ApiError on non-ok response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: () => Promise.resolve({ message: "Invalid token" }),
    });

    await expect(apiRequest("/api/protected")).rejects.toThrow(ApiError);
    await expect(apiRequest("/api/protected")).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid token",
    });
  });

  it("handles JSON parse failure in error response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.reject(new Error("bad json")),
    });

    await expect(apiRequest("/api/broken")).rejects.toThrow(ApiError);
    await expect(apiRequest("/api/broken")).rejects.toMatchObject({
      statusCode: 500,
      message: "Internal Server Error",
    });
  });

  it("returns undefined for 204 No Content", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.reject(new Error("should not be called")),
    });

    const result = await apiRequest("/api/delete");
    expect(result).toBeUndefined();
  });

  it("uses custom API URL from config", async () => {
    mockGetApiUrl.mockReturnValue("https://api.prod.example.com");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true }),
    });

    await apiRequest("/api/health");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.prod.example.com/api/health",
      expect.any(Object)
    );
  });
});
