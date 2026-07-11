import { describe, it, expect } from "vitest";
import {
  systemHealthStatusSchema,
  probeStatusSchema,
  ciStatusSchema,
  migrationCheckStatusSchema,
  runInfoSchema,
  serviceCheckSchema,
  staticSiteCheckSchema,
  systemHealthSchema,
} from "./health-system.js";

describe("system-health enum schemas", () => {
  it.each(["healthy", "degraded", "unhealthy"])("systemHealthStatusSchema accepts %s", (s) => {
    expect(systemHealthStatusSchema.safeParse(s).success).toBe(true);
  });

  it("systemHealthStatusSchema rejects an unknown status", () => {
    expect(systemHealthStatusSchema.safeParse("down").success).toBe(false);
  });

  it.each(["ok", "error", "timeout"])("probeStatusSchema accepts %s", (s) => {
    expect(probeStatusSchema.safeParse(s).success).toBe(true);
  });

  it("probeStatusSchema rejects an unknown status", () => {
    expect(probeStatusSchema.safeParse("stale").success).toBe(false);
  });

  it.each(["healthy", "unhealthy", "stale"])("ciStatusSchema accepts %s", (s) => {
    expect(ciStatusSchema.safeParse(s).success).toBe(true);
  });

  it.each(["ok", "error", "stale", "unknown"])("migrationCheckStatusSchema accepts %s", (s) => {
    expect(migrationCheckStatusSchema.safeParse(s).success).toBe(true);
  });
});

describe("runInfoSchema", () => {
  it("parses the required fields and preserves unknown catchall keys", () => {
    const parsed = runInfoSchema.parse({
      conclusion: "success",
      updated_at: "2026-07-11T00:00:00Z",
      run_id: 12345,
      html_url: "https://example.test/run",
    });
    expect(parsed.conclusion).toBe("success");
    expect((parsed as Record<string, unknown>).run_id).toBe(12345);
  });

  it("rejects when a required field is missing", () => {
    expect(runInfoSchema.safeParse({ conclusion: "success" }).success).toBe(false);
  });
});

describe("probe check schemas", () => {
  it("serviceCheckSchema accepts a full detailed check", () => {
    expect(
      serviceCheckSchema.safeParse({
        status: "ok",
        latency: 12,
        version: "1.2.3",
        checks: { db: "ok" },
      }).success
    ).toBe(true);
  });

  it("serviceCheckSchema accepts the minimal shape (optional fields omitted)", () => {
    expect(serviceCheckSchema.safeParse({ status: "ok", latency: 4 }).success).toBe(true);
  });

  it("serviceCheckSchema rejects a non-numeric latency", () => {
    expect(serviceCheckSchema.safeParse({ status: "ok", latency: "fast" }).success).toBe(false);
  });

  it("staticSiteCheckSchema accepts a valid probe", () => {
    expect(staticSiteCheckSchema.safeParse({ status: "ok", latency: 30 }).success).toBe(true);
  });
});

describe("systemHealthSchema", () => {
  const detailed = {
    status: "healthy",
    timestamp: "2026-07-11T00:00:00Z",
    requestId: "req-123",
    subsystems: {
      services: {
        status: "healthy",
        checks: {
          users: { status: "ok", latency: 12, version: "1.0.0", checks: { db: "ok" } },
        },
      },
      static_sites: {
        status: "healthy",
        checks: { marketing: { status: "ok", latency: 40 } },
      },
      ci: {
        status: "healthy",
        last_run: { conclusion: "success", updated_at: "2026-07-11T00:00:00Z" },
      },
      deploys: {
        status: "healthy",
        pipelines: { agent: { conclusion: "success", updated_at: "2026-07-11T00:00:00Z" } },
      },
      migrations: {
        status: "healthy",
        checks: {
          reservations: {
            status: "ok",
            last_run: { conclusion: "success", updated_at: "2026-07-11T00:00:00Z" },
          },
        },
      },
    },
  };

  const coarse = {
    status: "degraded",
    timestamp: "2026-07-11T00:00:00Z",
    requestId: "req-456",
    subsystems: {
      services: { status: "degraded" },
      static_sites: { status: "healthy" },
      ci: { status: "stale" },
      deploys: { status: "healthy" },
    },
  };

  it("parses a full detailed response", () => {
    expect(systemHealthSchema.safeParse(detailed).success).toBe(true);
  });

  it("parses a coarse response (optional checks and migrations omitted)", () => {
    expect(systemHealthSchema.safeParse(coarse).success).toBe(true);
  });

  it("accepts a nullable ci.last_run", () => {
    const result = systemHealthSchema.safeParse({
      ...coarse,
      subsystems: { ...coarse.subsystems, ci: { status: "healthy", last_run: null } },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an out-of-union overall status", () => {
    expect(systemHealthSchema.safeParse({ ...coarse, status: "on-fire" }).success).toBe(false);
  });

  it("rejects a response missing a required subsystem", () => {
    const { deploys: _omitted, ...withoutDeploys } = coarse.subsystems;
    expect(
      systemHealthSchema.safeParse({ ...coarse, subsystems: withoutDeploys }).success
    ).toBe(false);
  });
});
