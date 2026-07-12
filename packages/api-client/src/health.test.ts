import { describe, it, expect, vi, beforeEach } from "vitest";
import { systemHealthSchema } from "@mbe/types";
import { ApiClient, ApiValidationError } from "./client.js";
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

function makeHealthClient() {
  return new HealthClient(new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 }));
}

/**
 * Representative `/health/system` snapshots produced by the edge router's
 * `infrastructure/worker/health/system.js` handler. The worker-side contract
 * test (system.contract.test.js) proves the live producer emits these shapes;
 * here they exercise the same canonical schema from the consumer side.
 */
const detailedSnapshot = {
  status: "healthy",
  timestamp: "2026-01-15T12:00:00Z",
  requestId: "req-detailed",
  subsystems: {
    services: {
      status: "healthy",
      checks: {
        users: {
          status: "ok",
          latency: 42,
          version: "1.2.3",
          checks: { database: { status: "ok", latency: 5 } },
        },
        reservations: { status: "ok", latency: 30 },
      },
    },
    static_sites: {
      status: "healthy",
      checks: {
        hospitality: { status: "ok", latency: 12 },
        marketing: { status: "ok", latency: 8 },
      },
    },
    ci: {
      status: "healthy",
      last_run: { conclusion: "success", updated_at: "2026-01-15T11:50:00Z", id: 42, sha: "abc" },
    },
    deploys: {
      status: "healthy",
      pipelines: {
        static: { conclusion: "success", updated_at: "2026-01-15T11:00:00Z", sha: "abc" },
        services: null,
        infrastructure: null,
      },
    },
    migrations: {
      status: "degraded",
      checks: {
        users: {
          status: "ok",
          last_run: { conclusion: "success", updated_at: "2026-01-15T10:00:00Z", service: "users" },
        },
        reservations: { status: "unknown" },
      },
    },
  },
};

const coarseSnapshot = {
  status: "degraded",
  timestamp: "2026-01-15T12:00:00Z",
  requestId: "req-coarse",
  subsystems: {
    services: { status: "healthy" },
    static_sites: { status: "degraded" },
    ci: { status: "stale" },
    deploys: { status: "healthy" },
  },
};

describe("systemHealthSchema (canonical /health/system contract)", () => {
  it("parses a detailed (authenticated) snapshot", () => {
    const parsed = systemHealthSchema.parse(detailedSnapshot);
    expect(parsed.subsystems.services.checks).toBeDefined();
    expect(parsed.subsystems.migrations?.status).toBe("degraded");
  });

  it("parses a coarse (unauthenticated) snapshot without detail or migrations", () => {
    const parsed = systemHealthSchema.parse(coarseSnapshot);
    expect(parsed.subsystems.services.checks).toBeUndefined();
    expect(parsed.subsystems.migrations).toBeUndefined();
    expect(parsed.subsystems.ci.status).toBe("stale");
  });

  it("rejects a status outside the union (not `status: string`)", () => {
    const bogus = { ...coarseSnapshot, status: "green" };
    expect(systemHealthSchema.safeParse(bogus).success).toBe(false);
  });

  it("rejects a probe status outside the union", () => {
    const bogus = structuredClone(detailedSnapshot);
    bogus.subsystems.services.checks.reservations.status = "flaky";
    expect(systemHealthSchema.safeParse(bogus).success).toBe(false);
  });
});

describe("HealthClient.system", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("GETs /api/health/system (bare, unenveloped) and returns the validated snapshot", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(detailedSnapshot));

    const result = await makeHealthClient().system();

    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.test.com/api/health/system");
    expect(options?.method ?? "GET").toBe("GET");
    expect(result).toEqual(detailedSnapshot);
  });

  it("accepts a coarse snapshot", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(coarseSnapshot));

    const result = await makeHealthClient().system();
    expect(result.status).toBe("degraded");
    expect(result.subsystems.migrations).toBeUndefined();
  });

  it("rejects a malformed snapshot at the seam", async () => {
    // Missing `subsystems` — the seam must reject rather than pass it through.
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ status: "healthy", timestamp: "2026-01-15T12:00:00Z", requestId: "x" })
    );

    await expect(makeHealthClient().system()).rejects.toThrow(ApiValidationError);
  });

  it("propagates errors from the API client", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        { error: "Internal Server Error", message: "Service unavailable", statusCode: 500 },
        500
      )
    );

    await expect(makeHealthClient().system()).rejects.toThrow();
  });

  it("propagates network errors", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(makeHealthClient().system()).rejects.toThrow(TypeError);
  });
});
