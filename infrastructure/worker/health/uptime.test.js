/**
 * Tests for the health/uptime handler.
 */

import { describe, it, expect, vi } from "vitest";
import { handleHealthUptime } from "./uptime.js";

function makeKv(snapshots = {}) {
  return {
    get: vi.fn(async (key, _format) => snapshots[key] ?? null),
  };
}

describe("handleHealthUptime", () => {
  it("returns null uptime and message when no snapshots exist", async () => {
    const env = { HEALTH_STATE: makeKv() };
    const response = await handleHealthUptime(env);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.uptime).toBeNull();
    expect(body.daysTracked).toBe(0);
    expect(body.message).toBeDefined();
  });

  it("returns uptime percentage when snapshots exist", async () => {
    // Build a day key for today
    const today = new Date().toISOString().slice(0, 10);
    const snapshots = {
      [`uptime/${today}`]: { status: "healthy" },
    };
    const env = { HEALTH_STATE: makeKv(snapshots) };
    const response = await handleHealthUptime(env);
    const body = await response.json();
    expect(body.uptimePercent).toBe(100);
    expect(body.healthyDays).toBe(1);
    expect(body.totalDays).toBe(1);
  });

  it("counts unhealthy days correctly", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    const snapshots = {
      [`uptime/${today}`]: { status: "healthy" },
      [`uptime/${yesterday}`]: { status: "unhealthy" },
    };
    const env = { HEALTH_STATE: makeKv(snapshots) };
    const response = await handleHealthUptime(env);
    const body = await response.json();
    expect(body.uptimePercent).toBe(50);
    expect(body.healthyDays).toBe(1);
    expect(body.totalDays).toBe(2);
  });

  it("returns JSON content type", async () => {
    const env = { HEALTH_STATE: makeKv() };
    const response = await handleHealthUptime(env);
    expect(response.headers.get("Content-Type")).toContain("application/json");
  });
});
