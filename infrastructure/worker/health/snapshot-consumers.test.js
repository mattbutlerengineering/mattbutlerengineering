/**
 * Consumers (uptime, performance) fed REAL /health/system output produced
 * in-process by the handler — both the coarse and the detailed variant.
 * Guards against the guessed-`services`-key drift (#6385).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { handleHealthSystem } from "./system.js";
import { handleHealthUptime } from "./uptime.js";
import { handleHealthPerformance } from "./performance.js";

vi.mock("../deploy-health.js", () => ({
  STALENESS_THRESHOLD_MS: 60 * 60 * 1000,
  interpretDeployHealth: (data) => (data ? { status: "healthy" } : { status: "stale" }),
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
    staticRoutes: [{ binding: "HOSPITALITY", prefix: "/hospitality", routeName: "hospitality" }],
    kvKeys: {
      ci: "ci/status",
      deployStatic: "deploy/static",
      deployServices: "deploy/services",
      deployInfrastructure: "deploy/infrastructure",
    },
  },
}));

const fresh = () => ({ conclusion: "success", updated_at: new Date().toISOString() });
const KV = {
  "ci/status": fresh(),
  "deploy/static": fresh(),
  "deploy/services": fresh(),
  "deploy/infrastructure": fresh(),
  "migrate/users": fresh(),
  "migrate/reservations": fresh(),
};

async function realResponse({ detailed }) {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ status: "ok" })));
  const env = {
    API_ORIGIN: "https://api.example.com",
    HEALTH_TOKEN: "secret",
    HEALTH_STATE: { get: async (k) => KV[k] ?? null },
    HOSPITALITY: { fetch: async () => new Response("ok") },
  };
  const request = new Request("https://example.com/health/system", {
    headers: detailed ? { Authorization: "Bearer secret" } : {},
  });
  return (await handleHealthSystem(request, env, "req-1")).json();
}

const kvOf = (data) => ({ get: vi.fn(async (key) => data[key] ?? null) });
const todayKey = () => `uptime/${new Date().toISOString().slice(0, 10)}`;
const hourKey = (hoursAgo) =>
  `latency/${new Date(Date.now() - hoursAgo * 3600_000)
    .toISOString()
    .slice(0, 13)
    .replace("T", "-")}`;

afterEach(() => {
  globalThis.fetch = undefined;
});

describe("uptime fed real /health/system output", () => {
  it("populates per-subsystem uptime from the coarse shape", async () => {
    const snapshot = await realResponse({ detailed: false });
    const env = { HEALTH_STATE: kvOf({ [todayKey()]: { snapshot, timestamp: "t" } }) };
    const body = await (await handleHealthUptime(env)).json();
    expect(body.subsystems.services.uptimePercent).toBe(100);
    expect(body.subsystems.ci.totalDays).toBe(1);
  });

  it("populates per-service uptime from the detailed shape", async () => {
    const snapshot = await realResponse({ detailed: true });
    const env = { HEALTH_STATE: kvOf({ [todayKey()]: { snapshot, timestamp: "t" } }) };
    const body = await (await handleHealthUptime(env)).json();
    expect(body.subsystems.users.uptimePercent).toBe(100);
    expect(body.subsystems.reservations.totalDays).toBe(1);
    expect(body.subsystems.hospitality.healthyDays).toBe(1);
  });
});

describe("performance fed real /health/system output", () => {
  it("populates per-service latency from the detailed shape", async () => {
    const detailed = await realResponse({ detailed: true });
    const env = { HEALTH_STATE: kvOf({ [hourKey(0)]: detailed }) };
    const body = await (await handleHealthPerformance(env)).json();
    expect(body.services.users.samples).toBe(1);
    expect(body.services.users.avgMs).toBeGreaterThanOrEqual(0);
  });

  it("coarse shape carries no latency and yields no per-service stats (no crash)", async () => {
    const coarse = await realResponse({ detailed: false });
    const env = { HEALTH_STATE: kvOf({ [hourKey(0)]: coarse }) };
    const body = await (await handleHealthPerformance(env)).json();
    expect(body.services).toEqual({});
  });

  it("trend uses the NEWEST samples (keys are newest-first)", async () => {
    // 20 samples: newest hour (0) is slow, everything older is fast.
    const data = {};
    for (let h = 0; h < 20; h++) {
      data[hourKey(h)] = { services: { users: { latency: h === 0 ? 1000 : 100 } } };
    }
    const body = await (await handleHealthPerformance({ HEALTH_STATE: kvOf(data) })).json();
    expect(body.services.users.recentP95Ms).toBe(1000);
    expect(body.services.users.trend).toBe("degrading");
  });
});
