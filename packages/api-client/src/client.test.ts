import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiClient, ApiClientError, buildQueryString } from "./client.js";

// Mock global fetch
const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { "Content-Type": "application/json" },
  });
}

describe("ApiClient", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("basic request functionality", () => {
    it("should make a GET request with correct URL and headers", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: "ok" }));

      const client = new ApiClient({ baseUrl: "https://api.test.com" });
      await client.get("/users");

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/users");
      expect((options?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    });

    it("should include authorization header when token is available", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: "ok" }));

      const client = new ApiClient({
        baseUrl: "https://api.test.com",
        getAccessToken: () => "my-token",
      });
      await client.get("/users");

      const [, options] = mockFetch.mock.calls[0]!;
      expect((options?.headers as Record<string, string>).Authorization).toBe("Bearer my-token");
    });

    it("should handle 204 No Content responses", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(null, { status: 204, statusText: "No Content" })
      );

      const client = new ApiClient({ baseUrl: "https://api.test.com" });
      const result = await client.delete("/users/1");

      expect(result).toBeUndefined();
    });

    it("should POST with JSON body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: "1" } }));

      const client = new ApiClient({ baseUrl: "https://api.test.com" });
      await client.post("/users", { name: "Alice" });

      const [, options] = mockFetch.mock.calls[0]!;
      expect(options?.method).toBe("POST");
      expect(options?.body).toBe(JSON.stringify({ name: "Alice" }));
    });

    it("should PATCH with JSON body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: "1" } }));

      const client = new ApiClient({ baseUrl: "https://api.test.com" });
      await client.patch("/users/1", { name: "Bob" });

      const [, options] = mockFetch.mock.calls[0]!;
      expect(options?.method).toBe("PATCH");
      expect(options?.body).toBe(JSON.stringify({ name: "Bob" }));
    });
  });

  describe("error handling", () => {
    it("should throw ApiClientError with method and path on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Not Found", message: "User not found", statusCode: 404 }, 404)
      );

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });

      await expect(client.get("/api/v1/users/999")).rejects.toThrow(ApiClientError);
    });

    it("should include method and path in error message", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse(
          { error: "Server Error", message: "Internal Server Error", statusCode: 500 },
          500
        )
      );

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });

      try {
        await client.get("/api/v1/users");
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientError);
        const apiError = error as ApiClientError;
        expect(apiError.message).toBe("GET /api/v1/users failed: 500 Internal Server Error");
        expect(apiError.method).toBe("GET");
        expect(apiError.path).toBe("/api/v1/users");
        expect(apiError.statusCode).toBe(500);
      }
    });

    it("should handle non-JSON error responses gracefully", async () => {
      mockFetch.mockResolvedValue(
        new Response("Bad Gateway", {
          status: 502,
          statusText: "Bad Gateway",
        })
      );

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });

      try {
        await client.get("/api/v1/users");
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientError);
        const apiError = error as ApiClientError;
        expect(apiError.statusCode).toBe(502);
      }
    });
  });

  describe("retry with exponential backoff", () => {
    it("should retry on 503 and succeed on subsequent attempt", async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse(
            { error: "Unavailable", message: "Service Unavailable", statusCode: 503 },
            503
          )
        )
        .mockResolvedValueOnce(jsonResponse({ data: "ok" }));

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 3 });
      const result = await client.get<{ data: string }>("/users");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ data: "ok" });
    });

    it("should retry on 502 and 504 status codes", async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({ error: "Bad Gateway", message: "Bad Gateway", statusCode: 502 }, 502)
        )
        .mockResolvedValueOnce(
          jsonResponse({ error: "Timeout", message: "Gateway Timeout", statusCode: 504 }, 504)
        )
        .mockResolvedValueOnce(jsonResponse({ data: "ok" }));

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 3 });
      const result = await client.get<{ data: string }>("/users");

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ data: "ok" });
    });

    it("should NOT retry on 400 client errors", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ error: "Bad Request", message: "Invalid input", statusCode: 400 }, 400)
      );

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 3 });

      await expect(client.get("/users")).rejects.toThrow(ApiClientError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should NOT retry on 500 server errors", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse(
          { error: "Server Error", message: "Internal Server Error", statusCode: 500 },
          500
        )
      );

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 3 });

      await expect(client.get("/users")).rejects.toThrow(ApiClientError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should NOT retry on 401 unauthorized", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ error: "Unauthorized", message: "Unauthorized", statusCode: 401 }, 401)
      );

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 3 });

      await expect(client.get("/users")).rejects.toThrow(ApiClientError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should retry on network errors (TypeError)", async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce(jsonResponse({ data: "ok" }));

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 3 });
      const result = await client.get<{ data: string }>("/users");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ data: "ok" });
    });

    it("should throw after exhausting all retries", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ error: "Unavailable", message: "Service Unavailable", statusCode: 503 }, 503)
      );

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 2 });

      await expect(client.get("/users")).rejects.toThrow(ApiClientError);
      // 1 initial + 2 retries = 3 total
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should disable retries when maxRetries is 0", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ error: "Unavailable", message: "Service Unavailable", statusCode: 503 }, 503)
      );

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });

      await expect(client.get("/users")).rejects.toThrow(ApiClientError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("timeout via AbortController", () => {
    it("should pass an AbortSignal to fetch", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: "ok" }));

      const client = new ApiClient({ baseUrl: "https://api.test.com", timeout: 5000 });
      await client.get("/users");

      const [, options] = mockFetch.mock.calls[0]!;
      expect(options?.signal).toBeDefined();
      expect(options?.signal).toBeInstanceOf(AbortSignal);
    });

    it("should use default 30s timeout when not configured", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: "ok" }));

      const client = new ApiClient({ baseUrl: "https://api.test.com" });
      await client.get("/users");

      const [, options] = mockFetch.mock.calls[0]!;
      expect(options?.signal).toBeDefined();
    });
  });

  describe("caller-provided AbortSignal", () => {
    it("should respect caller abort signal", async () => {
      const controller = new AbortController();

      mockFetch.mockImplementation(async (_url, options) => {
        // Simulate checking the signal
        if (options?.signal?.aborted) {
          throw new DOMException("The operation was aborted.", "AbortError");
        }
        return jsonResponse({ data: "ok" });
      });

      controller.abort();

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });

      await expect(
        client.request("/users", { method: "GET", signal: controller.signal })
      ).rejects.toThrow();
    });
  });

  describe("error categorization", () => {
    it("should categorize 400 as 'badRequest'", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Bad Request", message: "Invalid input", statusCode: 400 }, 400)
      );

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });

      try {
        await client.get("/users");
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientError);
        expect((error as ApiClientError).category).toBe("badRequest");
      }
    });

    it("should categorize 401 as 'unauthorized'", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Unauthorized", message: "No token", statusCode: 401 }, 401)
      );

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });

      try {
        await client.get("/users");
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect((error as ApiClientError).category).toBe("unauthorized");
      }
    });

    it("should categorize 403 as 'forbidden'", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Forbidden", message: "No access", statusCode: 403 }, 403)
      );

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });

      try {
        await client.get("/users");
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect((error as ApiClientError).category).toBe("forbidden");
      }
    });

    it("should categorize 404 as 'notFound'", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Not Found", message: "Not found", statusCode: 404 }, 404)
      );

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });

      try {
        await client.get("/users/999");
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect((error as ApiClientError).category).toBe("notFound");
      }
    });

    it("should categorize 409 as 'conflict'", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Conflict", message: "Already exists", statusCode: 409 }, 409)
      );

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });

      try {
        await client.post("/users", { name: "test" });
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect((error as ApiClientError).category).toBe("conflict");
      }
    });

    it("should categorize 422 as 'validationError'", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Unprocessable", message: "Bad data", statusCode: 422 }, 422)
      );

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });

      try {
        await client.post("/users", {});
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect((error as ApiClientError).category).toBe("validationError");
      }
    });

    it("should categorize 429 as 'rateLimited'", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Too Many", message: "Rate limited", statusCode: 429 }, 429)
      );

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });

      try {
        await client.get("/users");
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect((error as ApiClientError).category).toBe("rateLimited");
      }
    });

    it("should categorize 500 as 'serverError'", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Internal", message: "Server error", statusCode: 500 }, 500)
      );

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });

      try {
        await client.get("/users");
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect((error as ApiClientError).category).toBe("serverError");
      }
    });

    it("should categorize 502/503/504 as 'serverError'", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Bad Gateway", message: "Bad gateway", statusCode: 502 }, 502)
      );

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });

      try {
        await client.get("/users");
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect((error as ApiClientError).category).toBe("serverError");
      }
    });

    it("should categorize unknown status codes as 'unknown'", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Teapot", message: "I'm a teapot", statusCode: 418 }, 418)
      );

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });

      try {
        await client.get("/users");
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect((error as ApiClientError).category).toBe("unknown");
      }
    });
  });

  describe("unwrap helpers", () => {
    it("getOne should fetch and unwrap .data from ApiResponse", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: "1", name: "Alice" } }));

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });
      const result = await client.getOne<{ id: string; name: string }>("/api/v1/users/1");

      expect(result).toEqual({ id: "1", name: "Alice" });
    });

    it("postOne should post and unwrap .data from ApiResponse", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: "1", name: "Alice" } }));

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });
      const result = await client.postOne<{ id: string; name: string }>("/api/v1/users", {
        name: "Alice",
      });

      expect(result).toEqual({ id: "1", name: "Alice" });
    });

    it("patchOne should patch and unwrap .data from ApiResponse", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: "1", name: "Bob" } }));

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });
      const result = await client.patchOne<{ id: string; name: string }>("/api/v1/users/1", {
        name: "Bob",
      });

      expect(result).toEqual({ id: "1", name: "Bob" });
    });

    it("unwrap helpers should throw ApiClientError on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Not Found", message: "Not found", statusCode: 404 }, 404)
      );

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });

      await expect(client.getOne("/api/v1/users/999")).rejects.toThrow(ApiClientError);
    });
  });

  describe("get() with params", () => {
    it("should append query string when params are provided", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [] }));

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });
      await client.get("/api/v1/reservations", { venueId: "v1", date: "2026-06-01" });

      const [url] = mockFetch.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.searchParams.get("venueId")).toBe("v1");
      expect(parsed.searchParams.get("date")).toBe("2026-06-01");
    });

    it("should omit undefined values from query string", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [] }));

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });
      await client.get("/api/v1/reservations", { venueId: "v1", date: undefined });

      const [url] = mockFetch.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.searchParams.get("venueId")).toBe("v1");
      expect(parsed.searchParams.has("date")).toBe(false);
    });

    it("should omit null values from query string", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [] }));

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });
      await client.get("/api/v1/reservations", { venueId: "v1", status: null });

      const [url] = mockFetch.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.searchParams.get("venueId")).toBe("v1");
      expect(parsed.searchParams.has("status")).toBe(false);
    });

    it("should stringify number values", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [] }));

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });
      await client.get("/api/v1/tables", { page: 2, limit: 10 });

      const [url] = mockFetch.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.searchParams.get("page")).toBe("2");
      expect(parsed.searchParams.get("limit")).toBe("10");
    });

    it("should stringify boolean values", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [] }));

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });
      await client.get("/api/v1/tables", { activeOnly: true });

      const [url] = mockFetch.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.searchParams.get("activeOnly")).toBe("true");
    });

    it("should produce no query string when params is empty object", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [] }));

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });
      await client.get("/api/v1/venues", {});

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/venues");
    });

    it("should produce no query string when params is omitted", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [] }));

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });
      await client.get("/api/v1/venues");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/venues");
    });

    it("should join multiple params correctly", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [] }));

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });
      await client.get("/api/v1/reservations", {
        venueId: "v1",
        date: "2026-06-01",
        status: "CONFIRMED",
        page: 1,
        limit: 20,
      });

      const [url] = mockFetch.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.searchParams.get("venueId")).toBe("v1");
      expect(parsed.searchParams.get("date")).toBe("2026-06-01");
      expect(parsed.searchParams.get("status")).toBe("CONFIRMED");
      expect(parsed.searchParams.get("page")).toBe("1");
      expect(parsed.searchParams.get("limit")).toBe("20");
    });
  });

  describe("buildQueryString", () => {
    it("should return empty string for empty params", () => {
      expect(buildQueryString({})).toBe("");
    });

    it("should omit undefined values", () => {
      const result = buildQueryString({ a: "hello", b: undefined });
      const parsed = new URLSearchParams(result.slice(1));
      expect(parsed.has("b")).toBe(false);
      expect(parsed.get("a")).toBe("hello");
    });

    it("should omit null values", () => {
      const result = buildQueryString({ a: "hello", b: null });
      const parsed = new URLSearchParams(result.slice(1));
      expect(parsed.has("b")).toBe(false);
    });

    it("should stringify numbers", () => {
      const result = buildQueryString({ page: 3 });
      expect(result).toBe("?page=3");
    });

    it("should stringify booleans", () => {
      const result = buildQueryString({ activeOnly: false });
      expect(result).toBe("?activeOnly=false");
    });

    it("should return empty string when all values are undefined or null", () => {
      expect(buildQueryString({ a: undefined, b: null })).toBe("");
    });

    it("should start with ? when any value is present", () => {
      const result = buildQueryString({ key: "val" });
      expect(result.startsWith("?")).toBe(true);
    });
  });

  describe("per-request retry/timeout override", () => {
    it("should use per-request maxRetries override instead of client-wide value", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ error: "Unavailable", message: "Service Unavailable", statusCode: 503 }, 503)
      );

      // Client-wide maxRetries is 3, but per-request override is 0
      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 3 });

      await expect(client.get("/users", undefined, undefined, { maxRetries: 0 })).rejects.toThrow(
        ApiClientError
      );
      // With maxRetries:0 override, only 1 attempt
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should retry on transient failure when per-request maxRetries > 0", async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse(
            { error: "Unavailable", message: "Service Unavailable", statusCode: 503 },
            503
          )
        )
        .mockResolvedValueOnce(jsonResponse({ data: "ok" }));

      // Client-wide maxRetries is 0 (mutations-style), but GET uses per-request override
      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });
      const result = await client.get<{ data: string }>("/users", undefined, undefined, {
        maxRetries: 2,
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ data: "ok" });
    });

    it("should use per-request timeout override instead of client-wide value", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: "ok" }));

      const client = new ApiClient({ baseUrl: "https://api.test.com", timeout: 30_000 });
      await client.get("/users", undefined, undefined, { timeout: 5_000 });

      const [, options] = mockFetch.mock.calls[0]!;
      expect(options?.signal).toBeDefined();
      expect(options?.signal).toBeInstanceOf(AbortSignal);
    });

    it("should allow mutation (post) to disable retries per-request", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ error: "Unavailable", message: "Service Unavailable", statusCode: 503 }, 503)
      );

      // Client has retries enabled, but this mutation disables them
      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 3 });

      await expect(
        client.post("/sessions", { task: "test" }, undefined, { maxRetries: 0 })
      ).rejects.toThrow(ApiClientError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should not affect callers that omit the override — defaults unchanged", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ error: "Unavailable", message: "Service Unavailable", statusCode: 503 }, 503)
      );

      const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 1 });

      await expect(client.get("/users")).rejects.toThrow(ApiClientError);
      // 1 initial + 1 retry = 2 total (uses client-wide default)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("configuration defaults", () => {
    it("should use default timeout of 30000ms", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: "ok" }));

      const client = new ApiClient({ baseUrl: "https://api.test.com" });
      await client.get("/users");

      // Signal should be present (timeout is active)
      const [, options] = mockFetch.mock.calls[0]!;
      expect(options?.signal).toBeDefined();
    });

    it("should use default maxRetries of 3", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ error: "Unavailable", message: "Service Unavailable", statusCode: 503 }, 503)
      );

      const client = new ApiClient({ baseUrl: "https://api.test.com" });

      await expect(client.get("/users")).rejects.toThrow(ApiClientError);
      // 1 initial + 3 retries = 4 total
      expect(mockFetch).toHaveBeenCalledTimes(4);
    }, 15_000);

    it("should allow custom timeout", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: "ok" }));

      const client = new ApiClient({
        baseUrl: "https://api.test.com",
        timeout: 5000,
      });
      await client.get("/users");

      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it("should allow custom maxRetries", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ error: "Unavailable", message: "Service Unavailable", statusCode: 503 }, 503)
      );

      const client = new ApiClient({
        baseUrl: "https://api.test.com",
        maxRetries: 1,
      });

      await expect(client.get("/users")).rejects.toThrow(ApiClientError);
      // 1 initial + 1 retry = 2 total
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
