import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import {
  PublicRateLimitStore,
  publicRateLimitStore,
  publicRateLimit,
  extractVenueId,
  holdRateLimitHook,
} from "./public-rate-limit.js";

describe("PublicRateLimitStore", () => {
  let store: PublicRateLimitStore;

  beforeEach(() => {
    store = new PublicRateLimitStore();
  });

  describe("checkRequest", () => {
    it("allows requests below the limit", () => {
      const now = Date.now();
      for (let i = 0; i < 30; i++) {
        const result = store.checkRequest("1.2.3.4", "venue-a", now + i);
        expect(result.allowed).toBe(true);
      }
    });

    it("blocks the 31st request within the window", () => {
      const now = Date.now();
      for (let i = 0; i < 30; i++) {
        store.checkRequest("1.2.3.4", "venue-a", now + i);
      }
      const result = store.checkRequest("1.2.3.4", "venue-a", now + 30);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it("allows request after window expires", () => {
      const now = Date.now();
      for (let i = 0; i < 30; i++) {
        store.checkRequest("1.2.3.4", "venue-a", now + i);
      }
      const afterWindow = now + 61_000;
      const result = store.checkRequest("1.2.3.4", "venue-a", afterWindow);
      expect(result.allowed).toBe(true);
    });

    it("tracks limit per venue independently", () => {
      const now = Date.now();
      for (let i = 0; i < 30; i++) {
        store.checkRequest("1.2.3.4", "venue-a", now + i);
      }
      const result = store.checkRequest("1.2.3.4", "venue-b", now + 30);
      expect(result.allowed).toBe(true);
    });

    it("tracks limit per IP independently", () => {
      const now = Date.now();
      for (let i = 0; i < 30; i++) {
        store.checkRequest("1.2.3.4", "venue-a", now + i);
      }
      const result = store.checkRequest("5.6.7.8", "venue-a", now + 30);
      expect(result.allowed).toBe(true);
    });

    it("returns retryAfterMs based on oldest timestamp in window", () => {
      const now = 1_000_000;
      for (let i = 0; i < 30; i++) {
        store.checkRequest("1.2.3.4", "venue-a", now + i * 1000);
      }
      const laterNow = now + 29_000 + 500;
      const result = store.checkRequest("1.2.3.4", "venue-a", laterNow);
      expect(result.allowed).toBe(false);
      const expected = now + 60_000 - laterNow;
      expect(result.retryAfterMs).toBe(expected);
    });
  });

  describe("checkAndIncrementHolds", () => {
    it("allows up to 3 concurrent holds per IP", () => {
      expect(store.checkAndIncrementHolds("1.2.3.4").allowed).toBe(true);
      expect(store.checkAndIncrementHolds("1.2.3.4").allowed).toBe(true);
      expect(store.checkAndIncrementHolds("1.2.3.4").allowed).toBe(true);
    });

    it("blocks the 4th concurrent hold", () => {
      store.checkAndIncrementHolds("1.2.3.4");
      store.checkAndIncrementHolds("1.2.3.4");
      store.checkAndIncrementHolds("1.2.3.4");
      expect(store.checkAndIncrementHolds("1.2.3.4").allowed).toBe(false);
    });

    it("allows hold for different IP regardless of another IP limit", () => {
      store.checkAndIncrementHolds("1.2.3.4");
      store.checkAndIncrementHolds("1.2.3.4");
      store.checkAndIncrementHolds("1.2.3.4");
      expect(store.checkAndIncrementHolds("9.9.9.9").allowed).toBe(true);
    });
  });

  describe("decrementHolds", () => {
    it("decrements hold count allowing a new hold after release", () => {
      store.checkAndIncrementHolds("1.2.3.4");
      store.checkAndIncrementHolds("1.2.3.4");
      store.checkAndIncrementHolds("1.2.3.4");
      expect(store.checkAndIncrementHolds("1.2.3.4").allowed).toBe(false);
      store.decrementHolds("1.2.3.4");
      expect(store.checkAndIncrementHolds("1.2.3.4").allowed).toBe(true);
    });

    it("is a no-op for unknown IP", () => {
      expect(() => store.decrementHolds("0.0.0.0")).not.toThrow();
    });

    it("cleans up entry when count reaches zero", () => {
      store.checkAndIncrementHolds("1.2.3.4");
      store.decrementHolds("1.2.3.4");
      expect(store.getHoldCount("1.2.3.4")).toBe(0);
    });
  });

  describe("reset", () => {
    it("clears all state", () => {
      const now = Date.now();
      for (let i = 0; i < 30; i++) {
        store.checkRequest("1.2.3.4", "venue-a", now + i);
      }
      store.checkAndIncrementHolds("1.2.3.4");
      store.reset();
      expect(store.checkRequest("1.2.3.4", "venue-a", now + 100).allowed).toBe(true);
      expect(store.getHoldCount("1.2.3.4")).toBe(0);
    });
  });
});

describe("extractVenueId", () => {
  it("extracts venueId from query string", () => {
    const req = { query: { venueId: "v-1" }, body: null, params: {} } as unknown as Parameters<
      typeof extractVenueId
    >[0];
    expect(extractVenueId(req)).toBe("v-1");
  });

  it("extracts venueId from body", () => {
    const req = { query: {}, body: { venueId: "v-2" }, params: {} } as unknown as Parameters<
      typeof extractVenueId
    >[0];
    expect(extractVenueId(req)).toBe("v-2");
  });

  it("extracts venueId from params", () => {
    const req = { query: {}, body: null, params: { venueId: "v-3" } } as unknown as Parameters<
      typeof extractVenueId
    >[0];
    expect(extractVenueId(req)).toBe("v-3");
  });

  it("returns null when no venueId present", () => {
    const req = { query: {}, body: null, params: {} } as unknown as Parameters<
      typeof extractVenueId
    >[0];
    expect(extractVenueId(req)).toBeNull();
  });

  it("prefers query over body", () => {
    const req = {
      query: { venueId: "from-query" },
      body: { venueId: "from-body" },
      params: {},
    } as unknown as Parameters<typeof extractVenueId>[0];
    expect(extractVenueId(req)).toBe("from-query");
  });
});

describe("publicRateLimit plugin (HTTP integration)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    publicRateLimitStore.reset();
    app = Fastify({ logger: false });
    await app.register(publicRateLimit);
    app.get("/public/v1/test", async () => ({ ok: true }));
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    publicRateLimitStore.reset();
  });

  it("passes requests within the limit", async () => {
    const res = await app.inject({ method: "GET", url: "/public/v1/test?venueId=venue-x" });
    expect(res.statusCode).toBe(200);
  });

  it("returns 429 on the 31st request within the window", async () => {
    const now = Date.now();
    for (let i = 0; i < 30; i++) {
      publicRateLimitStore.checkRequest("127.0.0.1", "venue-y", now + i);
      publicRateLimitStore.checkRequest("127.0.0.1", "_global", now + i);
    }

    const res = await app.inject({ method: "GET", url: "/public/v1/test?venueId=venue-y" });
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
  });

  it("includes Retry-After header on 429", async () => {
    const now = Date.now();
    for (let i = 0; i < 30; i++) {
      publicRateLimitStore.checkRequest("127.0.0.1", "venue-z", now + i);
      publicRateLimitStore.checkRequest("127.0.0.1", "_global", now + i);
    }

    const res = await app.inject({ method: "GET", url: "/public/v1/test?venueId=venue-z" });
    expect(res.statusCode).toBe(429);
    const retryAfter = Number(res.headers["retry-after"]);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it("hitting venue-a does not count against venue-b limit", async () => {
    const now = Date.now();
    for (let i = 0; i < 30; i++) {
      publicRateLimitStore.checkRequest("127.0.0.1", "venue-a", now + i);
    }

    const res = await app.inject({ method: "GET", url: "/public/v1/test?venueId=venue-b" });
    expect(res.statusCode).toBe(200);
  });

  it("resets after window expires", async () => {
    const past = Date.now() - 61_000;
    for (let i = 0; i < 30; i++) {
      publicRateLimitStore.checkRequest("127.0.0.1", "venue-reset", past + i);
    }

    const res = await app.inject({ method: "GET", url: "/public/v1/test?venueId=venue-reset" });
    expect(res.statusCode).toBe(200);
  });
});

describe("holdRateLimitHook", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    publicRateLimitStore.reset();
    app = Fastify({ logger: false });
    app.post("/public/v1/holds", { preHandler: holdRateLimitHook }, async () => ({
      created: true,
    }));
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    publicRateLimitStore.reset();
  });

  it("allows up to 3 concurrent holds", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({ method: "POST", url: "/public/v1/holds" });
      expect(res.statusCode).toBe(200);
    }
  });

  it("blocks the 4th concurrent hold with 429", async () => {
    for (let i = 0; i < 3; i++) {
      await app.inject({ method: "POST", url: "/public/v1/holds" });
    }
    const res = await app.inject({ method: "POST", url: "/public/v1/holds" });
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
  });

  it("allows new hold after decrement", async () => {
    for (let i = 0; i < 3; i++) {
      await app.inject({ method: "POST", url: "/public/v1/holds" });
    }
    publicRateLimitStore.decrementHolds("127.0.0.1");
    const res = await app.inject({ method: "POST", url: "/public/v1/holds" });
    expect(res.statusCode).toBe(200);
  });
});
