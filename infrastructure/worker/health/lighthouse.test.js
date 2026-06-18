/**
 * Tests for the health/lighthouse handler.
 */

import { describe, it, expect, vi } from "vitest";
import { handleHealthLighthouse } from "./lighthouse.js";

function makeKv(keys = [], dataMap = {}) {
  return {
    list: vi.fn(async ({ prefix } = {}) => ({
      keys: keys.filter((k) => !prefix || k.startsWith(prefix)).map((name) => ({ name })),
    })),
    get: vi.fn(async (key, _format) => dataMap[key] ?? null),
  };
}

describe("handleHealthLighthouse", () => {
  it("returns message when no lighthouse data exists", async () => {
    const env = { HEALTH_STATE: makeKv() };
    const response = await handleHealthLighthouse(env);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.message).toBeDefined();
    expect(body.appsTracked).toBe(0);
  });

  it("returns app stats when scores exist", async () => {
    const score = {
      app: "hospitality",
      date: new Date().toISOString().slice(0, 10),
      performance: 95,
      accessibility: 98,
      bestPractices: 92,
      seo: 90,
    };
    const kv = makeKv(["lighthouse/hospitality-2026-01-01"], {
      "lighthouse/hospitality-2026-01-01": score,
    });
    const env = { HEALTH_STATE: kv };
    const response = await handleHealthLighthouse(env);
    const body = await response.json();
    expect(body.apps).toHaveProperty("hospitality");
    expect(body.apps.hospitality.latest).toHaveProperty("performance");
    expect(body.alerts).toBeDefined();
  });

  it("returns JSON content type", async () => {
    const env = { HEALTH_STATE: makeKv() };
    const response = await handleHealthLighthouse(env);
    expect(response.headers.get("Content-Type")).toContain("application/json");
  });
});
