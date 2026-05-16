import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import { apiVersioningPlugin, getSunsetDate, DEFAULT_SUCCESSOR_VERSION } from "./fastify.js";

// ---------------------------------------------------------------------------
// DEFAULT_SUCCESSOR_VERSION
// ---------------------------------------------------------------------------

describe("DEFAULT_SUCCESSOR_VERSION", () => {
  it("increments a standard vN version string", () => {
    expect(DEFAULT_SUCCESSOR_VERSION("v1")).toBe("v2");
    expect(DEFAULT_SUCCESSOR_VERSION("v2")).toBe("v3");
    expect(DEFAULT_SUCCESSOR_VERSION("v10")).toBe("v11");
  });

  it("returns undefined for non-standard version strings", () => {
    expect(DEFAULT_SUCCESSOR_VERSION("1.0")).toBeUndefined();
    expect(DEFAULT_SUCCESSOR_VERSION("beta")).toBeUndefined();
    expect(DEFAULT_SUCCESSOR_VERSION("")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getSunsetDate
// ---------------------------------------------------------------------------

describe("getSunsetDate", () => {
  it("returns a UTC string for a future date", () => {
    const result = getSunsetDate(6);
    const parsed = new Date(result);
    expect(parsed.getTime()).toBeGreaterThan(Date.now());
  });

  it("advances by the requested number of months", () => {
    const months = 3;
    const before = new Date();
    const result = getSunsetDate(months);
    const after = new Date();

    const parsed = new Date(result);
    const expectedMin = new Date(before);
    expectedMin.setMonth(expectedMin.getMonth() + months);
    const expectedMax = new Date(after);
    expectedMax.setMonth(expectedMax.getMonth() + months);

    // Allow ±2 days tolerance for month-boundary edge cases
    const twodays = 2 * 24 * 60 * 60 * 1000;
    expect(parsed.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime() - twodays);
    expect(parsed.getTime()).toBeLessThanOrEqual(expectedMax.getTime() + twodays);
  });

  it("returns a UTC-formatted string", () => {
    const result = getSunsetDate(1);
    // toUTCString() always contains 'GMT'
    expect(result).toMatch(/GMT/);
  });
});

// ---------------------------------------------------------------------------
// apiVersioningPlugin — registration and header behaviour
//
// We call the plugin function directly on the root Fastify instance rather
// than via fastify.register(), so that decorators land on the root scope and
// are accessible as fastify.apiVersion etc. (the same technique used in the
// existing plugin.test.ts).
// ---------------------------------------------------------------------------

describe("apiVersioningPlugin", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(() => {
    fastify = Fastify();
  });

  afterEach(async () => {
    await fastify.close();
  });

  // --- basic decorations ---

  it("decorates fastify with apiVersion", async () => {
    await apiVersioningPlugin(fastify, { currentVersion: "v1" });
    await fastify.ready();
    expect(fastify.apiVersion).toBe("v1");
  });

  it("decorates fastify with auto-computed successorVersion when not provided", async () => {
    await apiVersioningPlugin(fastify, { currentVersion: "v1" });
    await fastify.ready();
    expect(fastify.successorVersion).toBe("v2");
  });

  it("decorates fastify with explicit successorVersion", async () => {
    await apiVersioningPlugin(fastify, {
      currentVersion: "v1",
      successorVersion: "v3",
    });
    await fastify.ready();
    expect(fastify.successorVersion).toBe("v3");
  });

  it("leaves successorVersion undefined for non-standard currentVersion", async () => {
    await apiVersioningPlugin(fastify, { currentVersion: "beta" });
    await fastify.ready();
    expect(fastify.successorVersion).toBeUndefined();
  });

  it("decorates fastify with sunsetDate", async () => {
    await apiVersioningPlugin(fastify, { currentVersion: "v1" });
    await fastify.ready();
    expect(fastify.sunsetDate).toBeDefined();
    expect(new Date(fastify.sunsetDate).getTime()).toBeGreaterThan(Date.now());
  });

  it("respects custom sunsetMonthsFromNow", async () => {
    await apiVersioningPlugin(fastify, {
      currentVersion: "v1",
      sunsetMonthsFromNow: 12,
    });
    await fastify.ready();

    const sunset = new Date(fastify.sunsetDate);
    const twelveMonthsFromNow = new Date();
    twelveMonthsFromNow.setMonth(twelveMonthsFromNow.getMonth() + 12);

    // Allow ±2 days tolerance for month-boundary edge cases
    const twodays = 2 * 24 * 60 * 60 * 1000;
    expect(Math.abs(sunset.getTime() - twelveMonthsFromNow.getTime())).toBeLessThan(twodays);
  });

  // --- onSend hook: API-Version header ---

  it("adds API-Version response header on every request", async () => {
    await apiVersioningPlugin(fastify, { currentVersion: "v2" });
    fastify.get("/v2/health", async () => ({ ok: true }));
    await fastify.ready();

    const res = await fastify.inject({ method: "GET", url: "/v2/health" });
    expect(res.headers["api-version"]).toBe("v2");
  });

  it("adds Link successor-version header when successorVersion is set", async () => {
    await apiVersioningPlugin(fastify, {
      currentVersion: "v1",
      successorVersion: "v2",
    });
    fastify.get("/v1/items", async () => []);
    await fastify.ready();

    const res = await fastify.inject({ method: "GET", url: "/v1/items" });
    expect(res.headers["link"]).toBe('</v2/items>; rel="successor-version"');
  });

  it("rewrites version segment in Link header path", async () => {
    await apiVersioningPlugin(fastify, {
      currentVersion: "v1",
      successorVersion: "v2",
    });
    fastify.get("/v1/users/:id", async () => ({ id: "1" }));
    await fastify.ready();

    const res = await fastify.inject({ method: "GET", url: "/v1/users/42" });
    expect(res.headers["link"]).toBe('</v2/users/42>; rel="successor-version"');
  });

  it("omits Link header when successorVersion is undefined", async () => {
    await apiVersioningPlugin(fastify, { currentVersion: "beta" });
    fastify.get("/beta/ping", async () => ({ pong: true }));
    await fastify.ready();

    const res = await fastify.inject({ method: "GET", url: "/beta/ping" });
    expect(res.headers["link"]).toBeUndefined();
  });

  it("adds API-Version header on non-2xx responses", async () => {
    await apiVersioningPlugin(fastify, { currentVersion: "v1" });
    fastify.get("/v1/fail", async (_req, reply) => {
      reply.code(400).send({
        type: "https://example.com/errors/bad-request",
        title: "Bad Request",
        status: 400,
        detail: "bad request",
      });
    });
    await fastify.ready();

    const res = await fastify.inject({ method: "GET", url: "/v1/fail" });
    expect(res.statusCode).toBe(400);
    expect(res.headers["api-version"]).toBe("v1");
  });

  // --- addDeprecationHeaders decorator ---

  it("addDeprecationHeaders sets Deprecation header to true", async () => {
    await apiVersioningPlugin(fastify, { currentVersion: "v1" });
    fastify.get("/v1/old", async (_req, reply) => {
      fastify.addDeprecationHeaders(reply);
      return { deprecated: true };
    });
    await fastify.ready();

    const res = await fastify.inject({ method: "GET", url: "/v1/old" });
    expect(res.headers["deprecation"]).toBe("true");
  });

  it("addDeprecationHeaders sets Sunset header", async () => {
    await apiVersioningPlugin(fastify, { currentVersion: "v1" });
    fastify.get("/v1/old", async (_req, reply) => {
      fastify.addDeprecationHeaders(reply);
      return { deprecated: true };
    });
    await fastify.ready();

    const res = await fastify.inject({ method: "GET", url: "/v1/old" });
    expect(res.headers["sunset"]).toBeDefined();
    expect(res.headers["sunset"]).toMatch(/GMT/);
  });

  it("addDeprecationHeaders sets Link header when successorVersion present", async () => {
    await apiVersioningPlugin(fastify, {
      currentVersion: "v1",
      successorVersion: "v2",
    });
    fastify.get("/v1/old", async (_req, reply) => {
      fastify.addDeprecationHeaders(reply);
      return { deprecated: true };
    });
    await fastify.ready();

    const res = await fastify.inject({ method: "GET", url: "/v1/old" });
    const link = res.headers["link"] as string;
    expect(link).toContain('rel="successor-version"');
    expect(link).toContain("/v2/old");
  });

  it("addDeprecationHeaders skips Link header when no successorVersion", async () => {
    await apiVersioningPlugin(fastify, { currentVersion: "beta" });
    fastify.get("/beta/old", async (_req, reply) => {
      fastify.addDeprecationHeaders(reply);
      return { deprecated: true };
    });
    await fastify.ready();

    const res = await fastify.inject({ method: "GET", url: "/beta/old" });
    expect(res.headers["deprecation"]).toBe("true");
    // When no successor, the Link header from addDeprecationHeaders is absent
    // (the onSend hook also doesn't add one for non-standard versions)
    if (res.headers["link"]) {
      expect(res.headers["link"]).not.toContain('rel="successor-version"');
    }
  });
});
