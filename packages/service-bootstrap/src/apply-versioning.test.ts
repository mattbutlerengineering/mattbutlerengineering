import { describe, it, expect, afterEach } from "vitest";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { applyVersioning, type ApiVersioningConfig } from "./apply-versioning.js";

/**
 * Unit tests for the applyVersioning module.
 *
 * ADR-002 (API versioning strategy) governs the policy:
 * - API-Version header on every response (currentVersion)
 * - Link header with successor-version rel pointing to the next API version path
 * - addDeprecationHeaders decorator for routes marking old endpoints deprecated
 * - Fastify instance decorators: apiVersion, successorVersion, sunsetDate
 *
 * History: @mbe/api-versioning was a separate package, collapsed into
 * createServiceApp via PR #1656 (commit 6241fa3f). This module re-gives
 * the policy a dedicated name and test surface without resurrecting the package.
 */

async function buildTestApp(config?: Partial<ApiVersioningConfig>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  applyVersioning(app, config);
  return app;
}

describe("applyVersioning — header values", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it("adds API-Version header to every response (defaults to v1)", async () => {
    app = await buildTestApp();
    app.get("/v1/ping", async () => ({ ok: true }));
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/ping" });
    expect(res.headers["api-version"]).toBe("v1");
  });

  it("adds Link successor-version header (v1 → v2 by default)", async () => {
    app = await buildTestApp();
    app.get("/v1/items", async () => []);
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/items" });
    expect(res.headers["link"]).toBe('</v2/items>; rel="successor-version"');
  });

  it("uses custom currentVersion when provided", async () => {
    app = await buildTestApp({
      currentVersion: "v2",
      successorVersion: "v3",
      sunsetMonthsFromNow: 12,
    });
    app.get("/v2/items", async () => []);
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/v2/items" });
    expect(res.headers["api-version"]).toBe("v2");
    expect(res.headers["link"]).toBe('</v3/items>; rel="successor-version"');
  });

  it("does not add Link header when successorVersion is undefined", async () => {
    // If the user explicitly passes successorVersion as undefined, no Link header
    app = await buildTestApp({ currentVersion: "v1", successorVersion: undefined });
    app.get("/v1/ping", async () => ({ ok: true }));
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/ping" });
    // No link header when there is no successor
    expect(res.headers["link"]).toBeUndefined();
  });
});

describe("applyVersioning — sunset computation", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it("sunsetDate is in the future (default 6 months)", async () => {
    app = await buildTestApp();
    await app.ready();
    expect(app.sunsetDate).toBeDefined();
    expect(new Date(app.sunsetDate).getTime()).toBeGreaterThan(Date.now());
  });

  it("sunsetDate is approximately N months from now for custom sunsetMonthsFromNow", async () => {
    app = await buildTestApp({ sunsetMonthsFromNow: 12 });
    await app.ready();
    const sunsetMs = new Date(app.sunsetDate).getTime();
    const elevenMonthsFromNow = Date.now() + 11 * 30 * 24 * 60 * 60 * 1000;
    expect(sunsetMs).toBeGreaterThan(elevenMonthsFromNow);
  });
});

describe("applyVersioning — decorator wiring", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it("decorates fastify with apiVersion", async () => {
    app = await buildTestApp({
      currentVersion: "v1",
      successorVersion: "v2",
      sunsetMonthsFromNow: 6,
    });
    await app.ready();
    expect(app.apiVersion).toBe("v1");
  });

  it("decorates fastify with successorVersion", async () => {
    app = await buildTestApp({
      currentVersion: "v1",
      successorVersion: "v2",
      sunsetMonthsFromNow: 6,
    });
    await app.ready();
    expect(app.successorVersion).toBe("v2");
  });

  it("decorates fastify with sunsetDate string", async () => {
    app = await buildTestApp();
    await app.ready();
    expect(typeof app.sunsetDate).toBe("string");
    expect(app.sunsetDate).toMatch(/GMT/);
  });

  it("addDeprecationHeaders decorator sets Deprecation and Sunset response headers", async () => {
    app = await buildTestApp();
    app.get("/v1/old", async (_req, reply) => {
      app.addDeprecationHeaders(reply);
      return { deprecated: true };
    });
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/old" });
    expect(res.headers["deprecation"]).toBe("true");
    expect(res.headers["sunset"]).toMatch(/GMT/);
  });

  it("addDeprecationHeaders sets Link header when successorVersion is set", async () => {
    app = await buildTestApp({
      currentVersion: "v1",
      successorVersion: "v2",
      sunsetMonthsFromNow: 6,
    });
    app.get("/v1/old", async (_req, reply) => {
      app.addDeprecationHeaders(reply);
      return { deprecated: true };
    });
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/old" });
    expect(res.headers["link"]).toBe('</v2/old>; rel="successor-version"');
  });
});

describe("applyVersioning — contract (byte-identical to inlined block)", () => {
  let inlinedApp: FastifyInstance;
  let moduledApp: FastifyInstance;

  afterEach(async () => {
    if (inlinedApp) await inlinedApp.close();
    if (moduledApp) await moduledApp.close();
  });

  it("produces identical API-Version and Link headers as the former inlined block", async () => {
    // Replicate the inlined block behavior to prove byte-identical contract
    inlinedApp = Fastify({ logger: false });
    const currentVersion = "v1";
    const successorVersion = "v2";
    const sunsetDate = (() => {
      const date = new Date();
      date.setMonth(date.getMonth() + 6);
      return date.toUTCString();
    })();
    inlinedApp.addHook("onSend", async (_req, reply) => {
      reply.header("API-Version", currentVersion);
      if (successorVersion) {
        const path = _req.url.replace(/\/v\d+/, `/${successorVersion}`);
        reply.header("Link", `<${path}>; rel="successor-version"`);
      }
    });
    inlinedApp.decorate("addDeprecationHeaders", (reply: FastifyReply) => {
      reply.header("Deprecation", "true");
      reply.header("Sunset", sunsetDate);
      if (successorVersion) {
        const path = reply.request.url.replace(/\/v\d+/, `/${successorVersion}`);
        reply.header("Link", `<${path}>; rel="successor-version"`);
      }
    });
    inlinedApp.decorate("apiVersion", currentVersion);
    inlinedApp.decorate("successorVersion", successorVersion);
    inlinedApp.decorate("sunsetDate", sunsetDate);
    inlinedApp.get("/v1/items", async () => []);

    moduledApp = await buildTestApp({
      currentVersion: "v1",
      successorVersion: "v2",
      sunsetMonthsFromNow: 6,
    });
    moduledApp.get("/v1/items", async () => []);

    await Promise.all([inlinedApp.ready(), moduledApp.ready()]);

    const inlinedRes = await inlinedApp.inject({ method: "GET", url: "/v1/items" });
    const moduledRes = await moduledApp.inject({ method: "GET", url: "/v1/items" });

    expect(moduledRes.headers["api-version"]).toBe(inlinedRes.headers["api-version"]);
    expect(moduledRes.headers["link"]).toBe(inlinedRes.headers["link"]);
  });
});
