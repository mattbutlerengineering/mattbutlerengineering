import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import {
  publicRateLimitHook,
  resetRateLimitState,
  getActiveHoldCount,
  incrementHoldCount,
  decrementHoldCount,
  MAX_ACTIVE_HOLDS,
} from "./public-rate-limit.js";

describe("publicRateLimitPlugin", () => {
  beforeEach(() => {
    resetRateLimitState();
  });

  it("allows requests under the limit", async () => {
    const app = Fastify();
    app.get("/public/v1/venues/:slug", { preHandler: publicRateLimitHook }, async () => ({
      ok: true,
    }));
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/test-venue",
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("returns 429 after 30 requests in a minute", async () => {
    const app = Fastify();
    app.get("/public/v1/venues/:slug", { preHandler: publicRateLimitHook }, async () => ({
      ok: true,
    }));
    await app.ready();

    const responses = [];
    for (let i = 0; i < 32; i++) {
      responses.push(await app.inject({ method: "GET", url: "/public/v1/venues/test-venue" }));
    }

    const lastResponse = responses[responses.length - 1];
    expect(lastResponse.statusCode).toBe(429);
    expect(lastResponse.headers["retry-after"]).toBeDefined();
    const body = lastResponse.json();
    expect(body.title).toBe("Too Many Requests");
    await app.close();
  });

  it("rate limits per venue — hitting venue A doesn't count against venue B", async () => {
    const app = Fastify();
    app.get("/public/v1/venues/:slug", { preHandler: publicRateLimitHook }, async () => ({
      ok: true,
    }));
    await app.ready();

    for (let i = 0; i < 30; i++) {
      await app.inject({ method: "GET", url: "/public/v1/venues/venue-a" });
    }

    const responseB = await app.inject({
      method: "GET",
      url: "/public/v1/venues/venue-b",
    });

    expect(responseB.statusCode).toBe(200);
    await app.close();
  });

  it("resets after window expires", async () => {
    vi.useFakeTimers();
    const app = Fastify();
    app.get("/public/v1/venues/:slug", { preHandler: publicRateLimitHook }, async () => ({
      ok: true,
    }));
    await app.ready();

    for (let i = 0; i < 30; i++) {
      await app.inject({ method: "GET", url: "/public/v1/venues/test-venue" });
    }

    vi.advanceTimersByTime(61_000);

    const response = await app.inject({
      method: "GET",
      url: "/public/v1/venues/test-venue",
    });

    expect(response.statusCode).toBe(200);
    await app.close();
    vi.useRealTimers();
  });
});

describe("hold count tracking", () => {
  beforeEach(() => {
    resetRateLimitState();
  });

  it("tracks active holds per IP", () => {
    expect(getActiveHoldCount("1.2.3.4")).toBe(0);
    incrementHoldCount("1.2.3.4");
    expect(getActiveHoldCount("1.2.3.4")).toBe(1);
    incrementHoldCount("1.2.3.4");
    expect(getActiveHoldCount("1.2.3.4")).toBe(2);
  });

  it("decrements hold count", () => {
    incrementHoldCount("1.2.3.4");
    incrementHoldCount("1.2.3.4");
    decrementHoldCount("1.2.3.4");
    expect(getActiveHoldCount("1.2.3.4")).toBe(1);
  });

  it("does not go below zero", () => {
    decrementHoldCount("1.2.3.4");
    expect(getActiveHoldCount("1.2.3.4")).toBe(0);
  });

  it("MAX_ACTIVE_HOLDS is 3", () => {
    expect(MAX_ACTIVE_HOLDS).toBe(3);
  });
});
