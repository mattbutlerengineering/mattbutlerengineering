/**
 * Tests for the migrated health command using the defineCommand seam.
 * Asserts returned CommandResult values — no console/process.exit spies.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CommandResult } from "../command-seam.js";

const originalFetch = globalThis.fetch;

describe("health command run (value-asserted via seam)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const sampleHealth = {
    status: "healthy",
    timestamp: "2026-01-01T00:00:00Z",
    services: {
      users: { status: "healthy", latency: 42, version: "1.0.0" },
    },
    staticSites: { marketing: { status: "ok" } },
    ci: { status: "healthy" },
    deploy: { status: "ok" },
  };

  async function callHealthRun(): Promise<CommandResult> {
    const { healthRun } = await import("../commands/health.js");
    return healthRun({});
  }

  it("returns json result with health data on success", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(sampleHealth),
    });

    const result = await callHealthRun();

    expect(result.kind).toBe("json");
    const json = result as Extract<typeof result, { kind: "json" }>;
    expect((json.data as typeof sampleHealth).status).toBe("healthy");
    expect((json.data as typeof sampleHealth).services).toBeDefined();
  });

  it("returns error result when fetch fails", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const result = await callHealthRun();

    expect(result.kind).toBe("error");
    const err = result as Extract<typeof result, { kind: "error" }>;
    expect(err.message).toContain("Network error");
    expect(err.exitCode).toBe(1);
  });

  it("returns error result when endpoint returns non-OK status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });

    const result = await callHealthRun();

    expect(result.kind).toBe("error");
    const err = result as Extract<typeof result, { kind: "error" }>;
    expect(err.message).toContain("503");
    expect(err.exitCode).toBe(1);
  });

  it("returns json result with degraded status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          status: "degraded",
          timestamp: "2026-01-01T00:00:00Z",
        }),
    });

    const result = await callHealthRun();

    expect(result.kind).toBe("json");
    const json = result as Extract<typeof result, { kind: "json" }>;
    expect((json.data as { status: string }).status).toBe("degraded");
  });
});
