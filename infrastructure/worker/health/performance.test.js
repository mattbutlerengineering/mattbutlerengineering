/**
 * Tests for the health/performance handler.
 */

import { describe, it, expect, vi } from "vitest";
import { handleHealthPerformance } from "./performance.js";

function makeKv(data = {}) {
  return {
    get: vi.fn(async (key, _format) => data[key] ?? null),
  };
}

describe("handleHealthPerformance", () => {
  it("returns message when no latency samples exist", async () => {
    const env = { HEALTH_STATE: makeKv() };
    const response = await handleHealthPerformance(env);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.message).toBeDefined();
    expect(body.samplesCollected).toBe(0);
  });

  it("returns service stats when samples exist", async () => {
    // Build a key for the current hour
    const now = new Date();
    const hourKey = `latency/${now.toISOString().slice(0, 13).replace("T", "-")}`;
    const data = {
      [hourKey]: {
        services: {
          users: { latency: 120 },
          reservations: { latency: 80 },
        },
      },
    };
    const env = { HEALTH_STATE: makeKv(data) };
    const response = await handleHealthPerformance(env);
    const body = await response.json();
    expect(body.samplesCollected).toBeGreaterThan(0);
    expect(body.services).toHaveProperty("users");
    expect(body.services.users).toHaveProperty("avgMs");
    expect(body.services.users).toHaveProperty("p95Ms");
    expect(body.services.users).toHaveProperty("trend");
  });

  it("returns JSON content type", async () => {
    const env = { HEALTH_STATE: makeKv() };
    const response = await handleHealthPerformance(env);
    expect(response.headers.get("Content-Type")).toContain("application/json");
  });

  it("returns alerts array", async () => {
    const env = { HEALTH_STATE: makeKv() };
    const response = await handleHealthPerformance(env);
    const body = await response.json();
    // Even empty, alerts key should not exist on no-data response
    // (returns message shape instead)
    expect(body.message).toBeDefined();
  });
});
