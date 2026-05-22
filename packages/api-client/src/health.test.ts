import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient } from "./client.js";
import { HealthClient } from "./health.js";

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { "Content-Type": "application/json" },
  });
}

function makeClient() {
  const apiClient = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });
  return new HealthClient(apiClient);
}

describe("HealthClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("getSystemHealth", () => {
    it("requests GET /api/health/system", async () => {
      const healthData = {
        status: "healthy",
        timestamp: "2026-01-15T12:00:00Z",
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(healthData));

      await makeClient().getSystemHealth();

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/health/system");
      expect(options?.method ?? "GET").toBe("GET");
    });

    it("returns system health data", async () => {
      const healthData = {
        status: "healthy",
        timestamp: "2026-01-15T12:00:00Z",
        services: {
          "users-api": { status: "healthy", latency: 42 },
          "reservations-api": { status: "degraded", latency: 150 },
        },
        ci: { status: "healthy" },
        deploy: { status: "healthy" },
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(healthData));

      const result = await makeClient().getSystemHealth();
      expect(result).toEqual(healthData);
    });

    it("returns minimal health data without optional fields", async () => {
      const healthData = {
        status: "healthy",
        timestamp: "2026-01-15T12:00:00Z",
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(healthData));

      const result = await makeClient().getSystemHealth();
      expect(result).toEqual(healthData);
      expect(result.services).toBeUndefined();
      expect(result.ci).toBeUndefined();
      expect(result.deploy).toBeUndefined();
    });

    it("propagates errors from the API client", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(
          { error: "Internal Server Error", message: "Service unavailable", statusCode: 500 },
          500
        )
      );

      await expect(makeClient().getSystemHealth()).rejects.toThrow();
    });

    it("propagates network errors", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await expect(makeClient().getSystemHealth()).rejects.toThrow(TypeError);
    });
  });
});
