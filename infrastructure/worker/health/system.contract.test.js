/**
 * Contract test: the `/health/system` producer must satisfy the single
 * canonical schema owned by `@mbe/types` (see ADR-009).
 *
 * This runs the real `handleHealthSystem` producer and parses its output —
 * both the coarse (unauthenticated) and detailed (authenticated) variants —
 * against `systemHealthSchema`, so the untyped worker can no longer drift from
 * the contract silently. If the producer changes shape, this test fails.
 */

import { describe, it, expect, vi } from "vitest";
// The worker is not an npm package, so `@mbe/types` is not on its module
// resolution path; import the canonical schema from the types package source
// directly (vitest transforms the TS). This is the one owner of the contract.
import { systemHealthSchema } from "../../../packages/types/src/schemas/health-system.js";
import { handleHealthSystem } from "./system.js";

// Mirror the dependency mocks used by system.test.js so the producer runs
// against a deterministic topology.
vi.mock("../deploy-health.js", () => ({
  STALENESS_THRESHOLD_MS: 60 * 60 * 1000,
  interpretDeployHealth: (data) => {
    if (!data) return { status: "stale" };
    if (data.conclusion === "success") return { status: "healthy" };
    if (data.conclusion === "cancelled") return { status: "stale" };
    return { status: "unhealthy" };
  },
}));

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
      { binding: "HOSPITALITY", prefix: "/hospitality", routeName: "hospitality" },
      { binding: "MARKETING", prefix: "", routeName: "marketing" },
    ],
    kvKeys: {
      ci: "ci/status",
      deployStatic: "deploy/static",
      deployServices: "deploy/services",
      deployInfrastructure: "deploy/infrastructure",
    },
  },
}));

function makeKv(overrides = {}) {
  return {
    get: vi.fn(async (key) => overrides[key] ?? null),
    put: vi.fn(),
  };
}

function makeBinding() {
  return { fetch: vi.fn(async () => new Response("ok", { status: 200 })) };
}

function freshRun(extra = {}) {
  return { conclusion: "success", updated_at: new Date().toISOString(), ...extra };
}

function makeEnv(kvOverrides = {}) {
  return {
    API_ORIGIN: "https://api.example.com",
    HEALTH_STATE: makeKv(kvOverrides),
    HOSPITALITY: makeBinding(),
    MARKETING: makeBinding(),
  };
}

const fullKv = {
  "ci/status": freshRun({ id: 42, branch: "main", sha: "abc123" }),
  "deploy/static": freshRun({ sha: "abc123" }),
  "deploy/services": freshRun({ sha: "def456" }),
  "deploy/infrastructure": freshRun({ sha: "ghi789" }),
  "migrate/users": freshRun({ service: "users" }),
  "migrate/reservations": freshRun({ service: "reservations" }),
};

describe("/health/system producer contract", () => {
  it("detailed (authenticated) output parses against systemHealthSchema", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: "ok",
            version: "1.2.3",
            checks: { database: { status: "ok", latency: 5 } },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
    );

    const env = { ...makeEnv(fullKv), HEALTH_TOKEN: "secret" };
    const request = new Request("https://example.com/health/system", {
      headers: { Authorization: "Bearer secret" },
    });
    const response = await handleHealthSystem(request, env, "req-detailed");
    const body = await response.json();

    // Detailed responses carry full subsystem detail — assert the schema
    // accepts the real producer output verbatim.
    const parsed = systemHealthSchema.parse(body);
    expect(parsed.subsystems.services.checks).toBeDefined();
    expect(parsed.subsystems.migrations).toBeDefined();
    expect(parsed.subsystems.ci.last_run).not.toBeNull();

    globalThis.fetch = undefined;
  });

  it("coarse (unauthenticated) output parses against systemHealthSchema", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 })
    );

    const request = new Request("https://example.com/health/system");
    const response = await handleHealthSystem(request, makeEnv(fullKv), "req-coarse");
    const body = await response.json();

    const parsed = systemHealthSchema.parse(body);
    // Coarse responses omit sensitive detail and the migrations subsystem.
    expect(parsed.subsystems.services.checks).toBeUndefined();
    expect(parsed.subsystems.migrations).toBeUndefined();

    globalThis.fetch = undefined;
  });

  it("rejects a payload whose status escapes the union (guards against `status: string`)", () => {
    const bogus = {
      status: "green",
      timestamp: new Date().toISOString(),
      requestId: "req-bogus",
      subsystems: {
        services: { status: "healthy" },
        static_sites: { status: "healthy" },
        ci: { status: "healthy" },
        deploys: { status: "healthy" },
      },
    };
    expect(systemHealthSchema.safeParse(bogus).success).toBe(false);
  });
});
