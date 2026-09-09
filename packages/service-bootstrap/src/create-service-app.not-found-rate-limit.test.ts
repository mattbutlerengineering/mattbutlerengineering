import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServiceApp, type ServiceAppConfig } from "./create-service-app.js";

/**
 * Exercises the REAL @fastify/rate-limit plugin — unlike create-service-app.test.ts,
 * which mocks @fastify/rate-limit out entirely, so it can never demonstrate the
 * missing x-ratelimit-* headers measured live against production (see
 * gotchas.md § Fastify / rate limiting). Fastify's default not-found handler
 * runs outside the route pipeline, so the limiter's onRoute hook — which
 * attaches to every registered route — never sees an unmatched path.
 */
function testConfig(): ServiceAppConfig {
  return {
    swagger: {
      title: "Test API",
      description: "Test API description",
      serverUrl: "http://localhost:9999",
    },
  };
}

describe("createServiceApp — not-found rate limiting", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it("carries rate-limit headers on a request to an unmatched path", async () => {
    app = await createServiceApp(testConfig(), { logger: false });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/api/v1/nonexistent-path-xyz" });

    expect(res.statusCode).toBe(404);
    // Not-found requests share the exact global bucket (100/min per IP) —
    // see the comment above the setNotFoundHandler call in create-service-app.ts.
    expect(res.headers["x-ratelimit-limit"]).toBe("100");
    expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
    expect(res.headers["x-ratelimit-reset"]).toBeDefined();
  });

  it("keeps Fastify's default 404 body shape unchanged", async () => {
    app = await createServiceApp(testConfig(), { logger: false });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/api/v1/nonexistent-path-xyz" });

    expect(res.json()).toEqual({
      message: "Route GET:/api/v1/nonexistent-path-xyz not found",
      error: "Not Found",
      statusCode: 404,
    });
  });

  it("returns 429 once the not-found bound is exceeded", async () => {
    app = await createServiceApp(testConfig(), { logger: false });
    await app.ready();

    // Global default is 100/min; exhaust it against an unmatched path.
    for (let i = 0; i < 100; i++) {
      await app.inject({ method: "GET", url: "/api/v1/nonexistent-path-xyz" });
    }
    const res = await app.inject({ method: "GET", url: "/api/v1/nonexistent-path-xyz" });

    expect(res.statusCode).toBe(429);
  });

  it("does not weaken a route's own config.rateLimit", async () => {
    app = await createServiceApp(testConfig(), { logger: false });
    app.get(
      "/api/v1/strict",
      { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
      async () => ({ ok: true })
    );
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/api/v1/strict" });

    expect(res.headers["x-ratelimit-limit"]).toBe("10");
  });
});
