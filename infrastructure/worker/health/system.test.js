/**
 * Tests for the health/system handler and its pure helper functions.
 *
 * All helpers are pure functions (no Worker runtime needed).
 * handleHealthSystem tests use mock KV, fetch, and service bindings.
 */

import { describe, it, expect, vi } from "vitest";
import {
  subsystemStatus,
  ciStatus,
  deployStatus,
  migrationStatus,
  computeSystemStatus,
  isHealthAuthorized,
  handleHealthSystem,
} from "./system.js";

// ── Mock deploy-health.js dependency ─────────────────────────────────
vi.mock("../deploy-health.js", () => ({
  STALENESS_THRESHOLD_MS: 60 * 60 * 1000,
  interpretDeployHealth: (data, now) => {
    if (!data) return { status: "stale" };
    const age = now - new Date(data.updated_at).getTime();
    if (age > 60 * 60 * 1000) return { status: "stale" };
    return { status: data.conclusion === "success" ? "healthy" : "unhealthy" };
  },
}));

// ── Mock routes-config.json ───────────────────────────────────────────
vi.mock("../routes-config.json", () => ({
  default: {
    services: [
      { name: "users", healthPath: "/api/v1/users/health", kvMigrateKey: "migrate/users" },
      {
        name: "reservations",
        healthPath: "/api/v1/reservations/health",
        kvMigrateKey: "migrate/reservations",
      },
    ],
    staticRoutes: [
      {
        binding: "HOSPITALITY",
        prefix: "/hospitality",
        bindingOrigin: "https://h.example.com",
        routeName: "hospitality",
      },
      {
        binding: "MARKETING",
        prefix: "",
        bindingOrigin: "https://m.example.com",
        routeName: "marketing",
      },
    ],
    kvKeys: {
      ci: "ci/status",
      deployStatic: "deploy/static",
      deployServices: "deploy/services",
      deployInfrastructure: "deploy/infrastructure",
      featureFlags: "feature-flags",
    },
    cacheClasses: {
      "static-site": {
        hashedAssets: "public, max-age=31536000, immutable",
        html: "public, max-age=0, must-revalidate",
      },
    },
  },
}));

// ── subsystemStatus ───────────────────────────────────────────────────
describe("subsystemStatus", () => {
  it("returns healthy when all checks are ok", () => {
    expect(subsystemStatus({ users: { status: "ok" }, reservations: { status: "ok" } })).toBe(
      "healthy"
    );
  });

  it("returns degraded when exactly one check is not ok", () => {
    expect(subsystemStatus({ users: { status: "ok" }, reservations: { status: "error" } })).toBe(
      "degraded"
    );
  });

  it("returns unhealthy when two or more checks are not ok", () => {
    expect(
      subsystemStatus({ users: { status: "error" }, reservations: { status: "timeout" } })
    ).toBe("unhealthy");
  });

  it("returns healthy for empty checks", () => {
    expect(subsystemStatus({})).toBe("healthy");
  });
});

// ── ciStatus ──────────────────────────────────────────────────────────
describe("ciStatus", () => {
  const now = Date.now();

  it("returns stale when kvData is null", () => {
    const result = ciStatus(null, now);
    expect(result.status).toBe("stale");
    expect(result.last_run).toBeNull();
  });

  it("returns healthy for a recent successful run", () => {
    const kvData = {
      conclusion: "success",
      updated_at: new Date(now - 1000).toISOString(),
    };
    const result = ciStatus(kvData, now);
    expect(result.status).toBe("healthy");
    expect(result.last_run).toBe(kvData);
  });

  it("returns unhealthy for a recent failed run", () => {
    const kvData = {
      conclusion: "failure",
      updated_at: new Date(now - 1000).toISOString(),
    };
    const result = ciStatus(kvData, now);
    expect(result.status).toBe("unhealthy");
  });

  it("returns stale for an old run", () => {
    const kvData = {
      conclusion: "success",
      updated_at: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
    };
    const result = ciStatus(kvData, now);
    expect(result.status).toBe("stale");
  });
});

// ── deployStatus ──────────────────────────────────────────────────────
describe("deployStatus", () => {
  const now = Date.now();
  const recentSuccess = {
    conclusion: "success",
    updated_at: new Date(now - 1000).toISOString(),
  };
  const recentFailure = {
    conclusion: "failure",
    updated_at: new Date(now - 1000).toISOString(),
  };

  it("returns healthy when all pipelines are healthy", () => {
    const result = deployStatus(
      { static: recentSuccess, services: recentSuccess, infrastructure: recentSuccess },
      now
    );
    expect(result.status).toBe("healthy");
  });

  it("returns unhealthy when at least one pipeline is unhealthy", () => {
    const result = deployStatus(
      { static: recentSuccess, services: recentFailure, infrastructure: recentSuccess },
      now
    );
    expect(result.status).toBe("unhealthy");
  });

  it("returns degraded when pipelines are stale but not failed", () => {
    const result = deployStatus(
      { static: null, services: recentSuccess, infrastructure: recentSuccess },
      now
    );
    expect(result.status).toBe("degraded");
  });
});

// ── migrationStatus ───────────────────────────────────────────────────
describe("migrationStatus", () => {
  const now = Date.now();

  it("returns ok for a recent successful migration", () => {
    const result = migrationStatus(
      {
        users: { conclusion: "success", updated_at: new Date(now - 1000).toISOString() },
      },
      now
    );
    expect(result.checks.users.status).toBe("ok");
    expect(result.status).toBe("healthy");
  });

  it("returns error for a recent failed migration", () => {
    const result = migrationStatus(
      {
        users: { conclusion: "failure", updated_at: new Date(now - 1000).toISOString() },
      },
      now
    );
    expect(result.checks.users.status).toBe("error");
    expect(result.status).toBe("unhealthy");
  });

  it("returns unknown for null migration data", () => {
    const result = migrationStatus({ users: null }, now);
    expect(result.checks.users.status).toBe("unknown");
    expect(result.status).toBe("degraded");
  });

  it("returns stale for old migration data", () => {
    const result = migrationStatus(
      {
        users: {
          conclusion: "success",
          updated_at: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
        },
      },
      now
    );
    expect(result.checks.users.status).toBe("stale");
  });
});

// ── computeSystemStatus ───────────────────────────────────────────────
describe("computeSystemStatus", () => {
  const healthy = { status: "healthy" };
  const degraded = { status: "degraded" };
  const unhealthy = { status: "unhealthy" };
  const stale = { status: "stale" };

  it("returns healthy when all subsystems are healthy", () => {
    expect(computeSystemStatus(healthy, healthy, healthy, healthy)).toBe("healthy");
  });

  it("returns unhealthy when services are unhealthy", () => {
    expect(computeSystemStatus(unhealthy, healthy, healthy, healthy)).toBe("unhealthy");
  });

  it("returns unhealthy when static sites are unhealthy", () => {
    expect(computeSystemStatus(healthy, unhealthy, healthy, healthy)).toBe("unhealthy");
  });

  it("returns unhealthy when deploys are unhealthy", () => {
    expect(computeSystemStatus(healthy, healthy, healthy, unhealthy)).toBe("unhealthy");
  });

  it("returns degraded when CI is stale", () => {
    expect(computeSystemStatus(healthy, healthy, stale, healthy)).toBe("degraded");
  });

  it("returns degraded when any subsystem is degraded", () => {
    expect(computeSystemStatus(degraded, healthy, healthy, healthy)).toBe("degraded");
  });
});

// ── isHealthAuthorized ────────────────────────────────────────────────
describe("isHealthAuthorized", () => {
  it("returns true for valid Bearer token", () => {
    const request = new Request("https://example.com/health/system", {
      headers: { Authorization: "Bearer my-secret-token" },
    });
    expect(isHealthAuthorized(request, { HEALTH_TOKEN: "my-secret-token" })).toBe(true);
  });

  it("returns false for wrong token", () => {
    const request = new Request("https://example.com/health/system", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(isHealthAuthorized(request, { HEALTH_TOKEN: "my-secret-token" })).toBe(false);
  });

  it("returns false when HEALTH_TOKEN is not configured", () => {
    const request = new Request("https://example.com/health/system", {
      headers: { Authorization: "Bearer any-token" },
    });
    expect(isHealthAuthorized(request, {})).toBe(false);
  });

  it("returns false when no Authorization header", () => {
    const request = new Request("https://example.com/health/system");
    expect(isHealthAuthorized(request, { HEALTH_TOKEN: "my-secret-token" })).toBe(false);
  });
});

// ── handleHealthSystem integration ───────────────────────────────────
describe("handleHealthSystem", () => {
  function makeKv(overrides = {}) {
    return {
      get: vi.fn(async (key, _format) => overrides[key] ?? null),
      put: vi.fn(),
    };
  }

  function makeBinding(name) {
    return {
      fetch: vi.fn(async () => new Response("ok", { status: 200 })),
    };
  }

  function makeEnv(kvOverrides = {}) {
    return {
      API_ORIGIN: "https://api.example.com",
      HEALTH_STATE: makeKv(kvOverrides),
      HOSPITALITY: makeBinding("HOSPITALITY"),
      MARKETING: makeBinding("MARKETING"),
    };
  }

  it("returns 200 with status field", async () => {
    // Mock fetch for service health endpoints
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    );

    const request = new Request("https://example.com/health/system");
    const response = await handleHealthSystem(request, makeEnv(), "req-123");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("timestamp");

    globalThis.fetch = undefined;
  });

  it("returns coarse response for unauthenticated requests", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 })
    );

    const request = new Request("https://example.com/health/system");
    const response = await handleHealthSystem(request, makeEnv(), "req-123");
    const body = await response.json();
    // Coarse: subsystem statuses present but no sensitive details
    expect(body.subsystems).toBeDefined();
    expect(body.subsystems.services).toHaveProperty("status");
    expect(body.subsystems.services).not.toHaveProperty("checks");

    globalThis.fetch = undefined;
  });

  it("returns detailed response for authenticated requests", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 })
    );

    const env = { ...makeEnv(), HEALTH_TOKEN: "secret" };
    const request = new Request("https://example.com/health/system", {
      headers: { Authorization: "Bearer secret" },
    });
    const response = await handleHealthSystem(request, env, "req-123");
    const body = await response.json();
    expect(body.subsystems.services).toHaveProperty("checks");
    expect(body.subsystems).toHaveProperty("migrations");

    globalThis.fetch = undefined;
  });
});
